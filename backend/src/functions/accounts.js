const { app } = require('@azure/functions');
const { connectToDatabase } = require('../db');
const Account = require('../models/accounts');
const { authMiddleware } = require('../middleware/auth');

app.http('createAccount', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const auth = authMiddleware(request);
            if (auth.error) {
                return { status: auth.status, jsonBody: { error: auth.error } };
            }

            const body = await request.json();
            const { bank_name, account_mask } = body;

            if (!bank_name || !account_mask) {
                return { status: 400, jsonBody: { error: 'Bank name and account mask are required' } };
            }

            await connectToDatabase();

            const account = new Account({
                user: auth.user.userId,
                bank_name,
                account_mask
            });

            await account.save();

            return { status: 201, jsonBody: { account } };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('updateAccount', {
    methods: ['PUT'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const auth = authMiddleware(request);
            if (auth.error) {
                return { status: auth.status, jsonBody: { error: auth.error } };
            }

            const accountId = request.query.get('id');
            if (!accountId) {
                return { status: 400, jsonBody: { error: 'Account ID is required' } };
            }

            const body = await request.json();
            const { bank_name, account_mask } = body;

            await connectToDatabase();

            const account = await Account.findOne({ _id: accountId, user: auth.user.userId });
            if (!account) {
                return { status: 404, jsonBody: { error: 'Account not found' } };
            }

            if (bank_name) account.bank_name = bank_name;
            if (account_mask) account.account_mask = account_mask;

            await account.save();

            return { jsonBody: { account } };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('deleteAccount', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const auth = authMiddleware(request);
            if (auth.error) {
                return { status: auth.status, jsonBody: { error: auth.error } };
            }

            const accountId = request.query.get('id');
            if (!accountId) {
                return { status: 400, jsonBody: { error: 'Account ID is required' } };
            }

            await connectToDatabase();

            const account = await Account.findOneAndDelete({ _id: accountId, user: auth.user.userId });
            if (!account) {
                return { status: 404, jsonBody: { error: 'Account not found' } };
            }

            return { jsonBody: { message: 'Account deleted successfully' } };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('getAccounts', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const auth = authMiddleware(request);
            if (auth.error) {
                return { status: auth.status, jsonBody: { error: auth.error } };
            }

            await connectToDatabase();

            const accounts = await Account.find({ user: auth.user.userId }).sort({ createdAt: -1 });

            return { jsonBody: { accounts } };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});