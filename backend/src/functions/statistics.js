const { app } = require('@azure/functions');
const { z } = require('zod');
const transactionModel = require('../models/transactions');
const { authMiddleware } = require('../middleware/auth');
const { connectToDatabase } = require('../db');
const { default: mongoose, mongo } = require('mongoose');

const querySchema = z.object({
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    account_id: z.string().optional(),
});

const categoryQuerySchema = z.object({
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    account_id: z.string().optional(),
    tnx_type: z.enum(['debit', 'credit']).default('debit'),
});

const spendingTrendQuerySchema = z.object({
    period: z.enum(['7d', '15d', 'month']).default('month'),
    account_id: z.string().optional(),
    tnx_type: z.enum(['debit', 'credit']).default('debit'),
});

function currentMonthRange() {
    const now = new Date();
    return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: now,
    };
}

app.http('getStatistics', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const auth = authMiddleware(request);
        if (auth.error) {
            return { status: auth.status, jsonBody: { error: auth.error } };
        }
        const userId = auth.user.userId;

        const rawQuery = {
            date_from: request.query.get('date_from'),
            date_to: request.query.get('date_to'),
            account_id: request.query.get('account_id'),
        };
        Object.keys(rawQuery).forEach(k => rawQuery[k] == null && delete rawQuery[k]);

        const parsed = querySchema.safeParse(rawQuery);
        if (!parsed.success) {
            const errors = parsed.error.issues.map(e => e.message).join(', ');
            return { status: 400, jsonBody: { error: errors } };
        }

        const { date_from, date_to, account_id } = parsed.data;
        const defaults = currentMonthRange();

        const fromDate = date_from ? new Date(date_from) : defaults.from;
        const toDate = date_to ? new Date(date_to) : defaults.to;
        toDate.setUTCHours(23, 59, 59, 999);

        if (isNaN(fromDate) || isNaN(toDate)) {
            return { status: 400, jsonBody: { error: 'Invalid date format. Use ISO 8601 (e.g. 2025-03-01).' } };
        }

        try {
            await connectToDatabase();

            const rangeFilter = {
                user: new mongoose.Types.ObjectId(userId),
                tnx_date: { $gte: fromDate, $lte: toDate },
            };
            if (account_id) rangeFilter.account_id = new mongoose.Types.ObjectId(account_id);

            const rangeAgg = await transactionModel.aggregate([
                { $match: rangeFilter },
                {
                    $group: {
                        _id: '$tnx_type',
                        total: { $sum: '$amount' },
                        count: { $sum: 1 },
                    },
                },
            ]);

            const overallFilter = { user: new mongoose.Types.ObjectId(userId) };
            if (account_id) overallFilter.account_id = new mongoose.Types.ObjectId(account_id);

            const overallAgg = await transactionModel.aggregate([
                { $match: overallFilter },
                {
                    $group: {
                        _id: '$tnx_type',
                        total: { $sum: '$amount' },
                        count: { $sum: 1 },
                    },
                },
            ]);

            function buildSummary(agg) {
                const map = {};
                for (const row of agg) map[row._id] = { total: row.total, count: row.count };
                const spent = map['debit'] ?? { total: 0, count: 0 };
                const gained = map['credit'] ?? { total: 0, count: 0 };
                return {
                    spent: { amount: spent.total, count: spent.count },
                    gained: { amount: gained.total, count: gained.count },
                    net: gained.total - spent.total,
                };
            }

            return {
                status: 200,
                jsonBody: {
                    date_range: {
                        from: fromDate,
                        to: toDate,
                    },
                    account_id: account_id ?? null,
                    range: buildSummary(rangeAgg),
                    overall: buildSummary(overallAgg),
                },
            };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('getCategoryBreakdown', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const auth = authMiddleware(request);
        if (auth.error) {
            return { status: auth.status, jsonBody: { error: auth.error } };
        }
        const userId = auth.user.userId;

        const rawQuery = {
            date_from: request.query.get('date_from'),
            date_to: request.query.get('date_to'),
            account_id: request.query.get('account_id'),
            tnx_type: request.query.get('tnx_type'),
        };
        Object.keys(rawQuery).forEach(k => rawQuery[k] == null && delete rawQuery[k]);

        const parsed = categoryQuerySchema.safeParse(rawQuery);
        if (!parsed.success) {
            const errors = parsed.error.issues.map(e => e.message).join(', ');
            return { status: 400, jsonBody: { error: errors } };
        }

        const { date_from, date_to, account_id, tnx_type } = parsed.data;
        const defaults = currentMonthRange();

        const fromDate = date_from ? new Date(date_from) : defaults.from;
        const toDate = date_to ? new Date(date_to) : defaults.to;

        if (isNaN(fromDate) || isNaN(toDate)) {
            return { status: 400, jsonBody: { error: 'Invalid date format. Use ISO 8601 (e.g. 2025-03-01).' } };
        }

        try {
            await connectToDatabase();

            const filter = {
                user: new mongoose.Types.ObjectId(userId),
                tnx_type,
                tnx_date: { $gte: fromDate, $lte: toDate },
            };
            if (account_id) filter.account_id = new mongoose.Types.ObjectId(account_id);

            const agg = await transactionModel.aggregate([
                { $match: filter },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'category',
                        foreignField: '_id',
                        as: 'categoryDoc',
                    },
                },
                {
                    $group: {
                        _id: {
                            category_id: { $ifNull: [{ $arrayElemAt: ['$categoryDoc._id', 0] }, null] },
                            category_name: { $ifNull: [{ $arrayElemAt: ['$categoryDoc.name', 0] }, 'Others'] },
                        },
                        amount: { $sum: '$amount' },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { amount: -1 } },
            ]);

            const total = agg.reduce((sum, row) => sum + row.amount, 0);

            const categories = agg.map(row => ({
                category_id: row._id.category_id,
                category_name: row._id.category_name,
                amount: row.amount,
                count: row.count,
                percentage: total > 0 ? parseFloat(((row.amount / total) * 100).toFixed(2)) : 0,
            }));
            return {
                status: 200,
                jsonBody: {
                    date_range: { from: fromDate, to: toDate },
                    account_id: account_id ?? null,
                    tnx_type,
                    total,
                    categories,
                },
            };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('getSpendingTrend', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const auth = authMiddleware(request);
        if (auth.error) {
            return { status: auth.status, jsonBody: { error: auth.error } };
        }
        const userId = auth.user.userId;

        const rawQuery = {
            period: request.query.get('period'),
            account_id: request.query.get('account_id'),
            tnx_type: request.query.get('tnx_type'),
        };
        Object.keys(rawQuery).forEach(k => rawQuery[k] == null && delete rawQuery[k]);

        const parsed = spendingTrendQuerySchema.safeParse(rawQuery);
        if (!parsed.success) {
            const errors = parsed.error.issues.map(e => e.message).join(', ');
            return { status: 400, jsonBody: { error: errors } };
        }

        const { period, account_id, tnx_type } = parsed.data;

        const now = new Date();
        let fromDate;

        if (period === '7d') {
            fromDate = new Date(now);
            fromDate.setDate(now.getDate() - 6);
            fromDate.setHours(0, 0, 0, 0);
        } else if (period === '15d') {
            fromDate = new Date(now);
            fromDate.setDate(now.getDate() - 14);
            fromDate.setHours(0, 0, 0, 0);
        } else {
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const toDate = new Date(now);
        toDate.setHours(23, 59, 59, 999);

        try {
            await connectToDatabase();

            const filter = {
                user: new mongoose.Types.ObjectId(userId),
                tnx_type,
                tnx_date: { $gte: fromDate, $lte: toDate },
            };
            if (account_id) filter.account_id = new mongoose.Types.ObjectId(account_id);
            console.log('Filter for aggregation:', filter);
            const agg = await transactionModel.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: {
                            year: { $year: '$tnx_date' },
                            month: { $month: '$tnx_date' },
                            day: { $dayOfMonth: '$tnx_date' },
                        },
                        amount: { $sum: '$amount' },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            ]);

            const aggMap = {};
            for (const row of agg) {
                const mm = String(row._id.month).padStart(2, '0');
                const dd = String(row._id.day).padStart(2, '0');
                aggMap[`${row._id.year}-${mm}-${dd}`] = { amount: row.amount, count: row.count };
            }

            const days = [];
            const cursor = new Date(fromDate);
            cursor.setHours(0, 0, 0, 0);

            while (cursor <= toDate) {
                const mm = String(cursor.getMonth() + 1).padStart(2, '0');
                const dd = String(cursor.getDate()).padStart(2, '0');
                const key = `${cursor.getFullYear()}-${mm}-${dd}`;
                const data = aggMap[key] ?? { amount: 0, count: 0 };
                days.push({ date: key, amount: data.amount, count: data.count });
                cursor.setDate(cursor.getDate() + 1);
            }

            const total = days.reduce((sum, d) => sum + d.amount, 0);
            console.log('response:', {
                period,
                date_range: { from: fromDate, to: toDate },
                account_id: account_id ?? null,
                tnx_type,
                total,
                days,
            });
            return {
                status: 200,
                jsonBody: {
                    period,
                    date_range: { from: fromDate, to: toDate },
                    account_id: account_id ?? null,
                    tnx_type,
                    total,
                    days,
                },
            };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});
