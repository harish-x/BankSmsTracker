const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    bank_name: String,
    account_mask: String
}, { timestamps: true });

const Account = mongoose.model('Account', accountSchema);

module.exports = Account;