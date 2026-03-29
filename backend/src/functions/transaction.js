const { app } = require('@azure/functions');
const { z } = require('zod');
const transactionModel = require('../models/transactions');
const MerchantAlias = require('../models/merchantAlias');
const Category = require('../models/category');
const { authMiddleware } = require('../middleware/auth');
const { connectToDatabase } = require('../db');
const { normalize } = require('../utils/smsParser');
const mongoose = require('mongoose');

const PAGE_SIZE = 50;

function getDefaultDateRange() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: now };
}

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    tnx_type: z.enum(['credit', 'debit']).optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    sort: z.enum(['asc', 'desc']).default('desc'),
    account_id: z.string().optional(),
});

app.http('transactions', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const auth = authMiddleware(request);
        if (auth.error) {
            return { status: auth.status, jsonBody: { error: auth.error } };
        }
        const userId = auth.user.userId;

        const rawQuery = {
            page: request.query.get('page'),
            tnx_type: request.query.get('tnx_type'),
            date_from: request.query.get('date_from'),
            date_to: request.query.get('date_to'),
            sort: request.query.get('sort'),
            account_id: request.query.get('account_id'),
        };

        Object.keys(rawQuery).forEach(k => rawQuery[k] == null && delete rawQuery[k]);

        const parsed = querySchema.safeParse(rawQuery);
        if (!parsed.success) {
            const errors = parsed.error.issues.map(e => e.message).join(', ');
            return { status: 400, jsonBody: { error: errors } };
        }

        const { page, tnx_type, date_from, date_to, sort, account_id } = parsed.data;
        const defaults = getDefaultDateRange();

        const fromDate = date_from ? new Date(date_from) : defaults.from;
        const toDate = date_to ? new Date(date_to) : defaults.to;

        if (isNaN(fromDate) || isNaN(toDate)) {
            return { status: 400, jsonBody: { error: 'Invalid date format. Use ISO 8601 (e.g. 2025-03-01).' } };
        }

        try {
            await connectToDatabase();

            const filter = {
                user: userId,
                tnx_date: { $gte: fromDate, $lte: toDate },
            };
            if (tnx_type) filter.tnx_type = tnx_type;
            if (account_id) filter.account_id = account_id;

            const sortOrder = sort === 'asc' ? 1 : -1;
            const skip = (page - 1) * PAGE_SIZE;

            const [rawTransactions, total] = await Promise.all([
                transactionModel
                    .find(filter)
                    .sort({ tnx_date: sortOrder })
                    .skip(skip)
                    .limit(PAGE_SIZE)
                    .populate('category', 'name')
                    .lean(),
                transactionModel.countDocuments(filter),
            ]);

            const transactions = rawTransactions.map(txn => ({
                ...txn,
                category: txn.category?.name ?? 'Others',
            }));

            return {
                status: 200,
                jsonBody: {
                    transactions,
                    pagination: {
                        page,
                        page_size: PAGE_SIZE,
                        total,
                        total_pages: Math.ceil(total / PAGE_SIZE),
                    },
                },
            };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('getTransaction', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'transaction/{id}',
    handler: async (request, context) => {
        const auth = authMiddleware(request);
        if (auth.error) {
            return { status: auth.status, jsonBody: { error: auth.error } };
        }
        const userId = auth.user.userId;

        const id = request.params.id;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return { status: 400, jsonBody: { error: 'Valid transaction ID is required' } };
        }

        try {
            await connectToDatabase();

            const txn = await transactionModel
                .findOne({ _id: id, user: userId })
                .populate('account_id', 'bank_name account_mask')
                .populate('merchant', 'original_name alias_name type category_id')
                .populate('category', 'name type')
                .lean();

            if (!txn) {
                return { status: 404, jsonBody: { error: 'Transaction not found' } };
            }

            const transaction = {
                _id: txn._id,
                amount: txn.amount,
                tnx_type: txn.tnx_type,
                tnx_date: txn.tnx_date,
                raw_message: txn.raw_message,
                source_name: txn.source_name,
                source_vpa: txn.source_vpa,
                createdAt: txn.createdAt,
                updatedAt: txn.updatedAt,
                account: txn.account_id
                    ? { _id: txn.account_id._id, bank_name: txn.account_id.bank_name, account_mask: txn.account_id.account_mask }
                    : null,
                merchant: txn.merchant
                    ? { _id: txn.merchant._id, original_name: txn.merchant.original_name, alias_name: txn.merchant.alias_name, type: txn.merchant.type, category_id: txn.merchant.category_id }
                    : null,
                category: txn.category
                    ? { _id: txn.category._id, name: txn.category.name, type: txn.category.type }
                    : { name: 'Others' },
            };

            return { status: 200, jsonBody: { transaction } };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('updateMerchantCategory', {
    methods: ['PUT'],
    authLevel: 'anonymous',
    route: 'merchant/{id}/category',
    handler: async (request, context) => {
        const auth = authMiddleware(request);
        if (auth.error) {
            return { status: auth.status, jsonBody: { error: auth.error } };
        }
        const userId = auth.user.userId;

        const merchantId = request.params.id;
        if (!merchantId || !mongoose.Types.ObjectId.isValid(merchantId)) {
            return { status: 400, jsonBody: { error: 'Valid merchant ID is required' } };
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
        }

        const categoryName = body?.category_name?.toString().trim();
        if (!categoryName) {
            return { status: 400, jsonBody: { error: 'category_name is required' } };
        }

        const normalizedCategoryName = normalize(categoryName);

        try {
            await connectToDatabase();

            const merchant = await MerchantAlias.findOne({ _id: merchantId, user: userId });
            if (!merchant) {
                return { status: 404, jsonBody: { error: 'Merchant not found' } };
            }

            // Find or create category by normalized name
            let category = await Category.findOne({
                user: userId,
                name: { $regex: new RegExp(`^${normalizedCategoryName.replace(/_/g, '[_ ]')}$`, 'i') }
            });

            const created = !category;
            if (!category) {
                category = await Category.create({
                    user: userId,
                    name: categoryName,
                });
            }

            // Update merchant
            merchant.category_id = category._id;
            await merchant.save();

            // Update all transactions for this merchant belonging to this user
            const { modifiedCount } = await transactionModel.updateMany(
                { user: userId, merchant: merchantId },
                { $set: { category: category._id } }
            );

            return {
                status: 200,
                jsonBody: {
                    category: {
                        _id: category._id,
                        name: category.name,
                        type: category.type,
                        created,
                    },
                    transactions_updated: modifiedCount,
                },
            };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

