const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    original_name: String,
    alias_name: String,
    normalized_key: { type: String, index: true },
    type: {
        type: String,
        enum: ['merchant', 'person'],
        default: 'merchant'
    },
    category_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    }

}, { timestamps: true, versionKey: false });

const MerchantAlias = mongoose.model('MerchantAlias', accountSchema);

module.exports = MerchantAlias;