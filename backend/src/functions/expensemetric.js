const { app } = require('@azure/functions');
const { authMiddleware } = require('../middleware/auth');
const transactionModel = require('../models/transactions');
const { parseSMS } = require('../utils/smsParser')

app.http('expensemetric', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {

        const auth = authMiddleware(request);
        if (auth.error) {
            return { status: auth.status, jsonBody: { error: auth.error } };
        }

        try {
            const body = await request.json();
            const { message } = body;

            if (!message) {
                return { status: 400, jsonBody: { error: "Message required" } };
            }

            const parsed = parseSMS(message);

            if (!parsed || !parsed.amount || !parsed.type) {
                await transactionModel.create({
                    user: auth.userId,
                    raw_message: message
                });

                return { status: 200, jsonBody: { message: "Stored unparsed SMS" } };
            }

            let accountDoc = null;

            if (parsed.bank_name && parsed.account_mask) {
                accountDoc = await Account.findOneAndUpdate(
                    {
                        user: auth.userId,
                        bank_name: parsed.bank_name,
                        account_mask: parsed.account_mask
                    },
                    {
                        $setOnInsert: {
                            user: auth.userId,
                            bank_name: parsed.bank_name,
                            account_mask: parsed.account_mask
                        }
                    },
                    { upsert: true, new: true }
                );
            }

            const transaction = await transactionModel.create({
                user: auth?.userId,
                account_id: accountDoc?._id,
                amount: parsed.amount,
                tnx_type: parsed.type,
                tnx_date: parsed.date,
                raw_message: message,
                source_name: parsed.source_name,
                source_vpa: parsed.source_vpa
            });

            return {
                status: 200,
                jsonBody: {
                    message: "Transaction stored",
                    transaction
                }
            };

        } catch (err) {
            context.log(err);

            return {
                status: 500,
                jsonBody: { error: "Internal server error" }
            };
        }
    }
});
