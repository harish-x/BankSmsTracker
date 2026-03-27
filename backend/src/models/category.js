const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['expense', 'income'],
        default: 'expense'
    }

}, { timestamps: true, versionKey: false });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;