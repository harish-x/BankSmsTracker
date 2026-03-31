const { app } = require('@azure/functions');
const { connectToDatabase } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { parseSMS, resolveMerchant, resolveCategory, isTransactionMessage } = require('../utils/smsParser')
const transactionModel = require('../models/transactions');
const AccountModel = require('../models/accounts');


app.http('expensemetric', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {

        const auth = authMiddleware(request);
        if (auth.error) {
            return { status: auth.status, jsonBody: { error: auth.error } };
        }

        const userId = auth.user.userId;

        try {
            await connectToDatabase();

            const body = await request.json();
            context.log('REQUEST BODY:', JSON.stringify(body));
            const { message } = body;

            if (!message) {
                const res = { status: 400, jsonBody: { error: "Message required" } };
                context.log('RESPONSE BODY:', JSON.stringify(res.jsonBody));
                return res;
            }

            if (!isTransactionMessage(message)) {
                const res = { status: 200, jsonBody: { message: "Ignored" } };
                context.log('RESPONSE BODY:', JSON.stringify(res.jsonBody));
                return res;
            }
            const parsed = parseSMS(message);

            if (!parsed || !parsed.amount || !parsed.type) {
                await transactionModel.create({
                    user: userId,
                    raw_message: message
                });

                const res = { status: 200, jsonBody: { message: "Stored unparsed SMS" } };
                context.log('RESPONSE BODY:', JSON.stringify(res.jsonBody));
                return res;
            }

            let accountDoc = null;

            if (parsed.bank_name && parsed.account_mask) {
                accountDoc = await AccountModel.findOneAndUpdate(
                    {
                        user: userId,
                        bank_name: parsed.bank_name,
                        account_mask: parsed.account_mask
                    },
                    {
                        $setOnInsert: {
                            user: userId,
                            bank_name: parsed.bank_name,
                            account_mask: parsed.account_mask
                        }
                    },
                    { upsert: true, new: true }
                );
            }
            const merchant = await resolveMerchant(userId, parsed);

            const category_id = await resolveCategory(userId, merchant);

            const transaction = await transactionModel.create({
                user: userId,
                account_id: accountDoc?._id,
                amount: parsed.amount,
                tnx_type: parsed.type,
                tnx_date: parsed.date,
                raw_message: message,
                source_name: parsed.source_name,
                source_vpa: parsed.source_vpa,
                category: category_id,
                merchant: merchant?._id
            });

            const res = {
                status: 201,
                jsonBody: {
                    message: "Transaction stored",
                    transaction
                }
            };
            context.log('RESPONSE BODY:', JSON.stringify(res.jsonBody));
            return res;

        } catch (err) {
            context.log('ERROR:', err.message);
            context.log('Stack:', err.stack);

            const res = { status: 500, jsonBody: { error: err.message || "Internal server error" } };
            context.log('RESPONSE BODY:', JSON.stringify(res.jsonBody));
            return res;
        }
    }
});
