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
            const { message } = body;

            if (!message) {
                return { status: 400, jsonBody: { error: "Message required" } };
            }

            if (!isTransactionMessage(message)) {
                return {
                    status: 200,
                    jsonBody: { message: "Ignored" }
                };
            }
            const parsed = parseSMS(message);

            if (!parsed || !parsed.amount || !parsed.type) {
                await transactionModel.create({
                    user: userId,
                    raw_message: message
                });

                return { status: 200, jsonBody: { message: "Stored unparsed SMS" } };
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

            return {
                status: 200,
                jsonBody: {
                    message: "Transaction stored",
                    transaction
                }
            };

        } catch (err) {
            context.log('ERROR:', err.message);
            context.log('Stack:', err.stack);

            return {
                status: 500,
                jsonBody: { error: err.message || "Internal server error" }
            };
        }
    }
});
