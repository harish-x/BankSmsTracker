const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    account_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
    },
    amount: Number,
    tnx_type: {
        type: String,
        enum: ['debit', 'credit']
    },
    tnx_date: Date,
    merchant:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MerchantAlias',
        default: null
    },
    category:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    raw_message: String,
    source_name: String,
    source_vpa: String,
}, { timestamps: true });

const transaction = mongoose.model('Transactions', transactionSchema);

module.exports = transaction;