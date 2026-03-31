const MerchantAlias = require('../models/merchantAlias');
const Category = require('../models/category');

const normalizeAmount = (amountStr) => {
    if (!amountStr) return null;
    return parseFloat(amountStr.replace(/,/g, ''));
};

const detectType = (msg) => {
    const lower = msg.toLowerCase();

    if (lower.includes('sent') || lower.includes('debited') || lower.includes('withdrawn') || lower.includes('charged') || lower.includes('paid') || lower.includes('purchased') || lower.includes('spent') || lower.includes('used')) {
        return 'debit';
    }

    if (lower.includes('credited') || lower.includes('deposited') || lower.includes('received') || lower.includes('refund') || lower.includes('refunded')) {
        return 'credit';
    }

    return null;
};

const normalize = (name) => {
    if (!name) return null;

    return name
        .toLowerCase()
        .replace(/[0-9]/g, '')
        .replace(/[^a-z\s]/g, '')
        .trim()
        .replace(/\s+/g, '_');
};

const extractAmount = (msg) => {
    const match =
        msg.match(/(?:Rs\.?|INR)\s?([\d,]+\.\d+)/i) ||
        msg.match(/([\d,]+\.\d+)\s?(?:Rs|INR)/i);

    return normalizeAmount(match?.[1]);
};

const extractAccount = (msg) => {
    const match = msg.match(/(?:A\/C|Acct|Account).*?(\*{0,2}X{0,2})(\d{3,6})/i);

    if (!match) return {};

    return {
        account_mask: match[2]
    };
};

const extractBank = (msg) => {
    const banks = [
        'HDFC',
        'ICICI',
        'SBI',
        'KOTAK',
        'AXIS',
        'INDIAN BANK',
        'TMB',
        'CANARA'
    ];

    const upper = msg.toUpperCase();

    for (let bank of banks) {
        if (upper.includes(bank)) return bank;
    }

    return null;
};

const extractSource = (msg, type) => {
    let source_name = null;
    let source_vpa = null;

    // vpa (upi) pattern
    const vpaMatch = msg.match(/([a-zA-Z0-9.\-_]+@[a-zA-Z]+)/);
    if (vpaMatch) {
        source_vpa = vpaMatch[1];
    }

    // name patterns
    if (type === 'debit') {
        const toMatch = msg.match(/To\s+([^\n]+)/i);
        if (toMatch) source_name = toMatch[1].trim();
    }

    if (type === 'credit' && !source_name) {
        const fromMatch = msg.match(/from\s+([^\n]+)/i);
        if (fromMatch) source_name = fromMatch[1].trim();
    }

    return { source_name, source_vpa };
};

const extractDate = (msg) => {
    const match =
        msg.match(/(\d{2}\/\d{2}\/\d{2})/) ||
        msg.match(/(\d{2}-\d{2}-\d{2})/);

    if (!match) return new Date();

    const [d, m, y] = match[1].replace(/-/g, '/').split('/');
    return new Date(`20${y}`, m - 1, d);
};

const isValidTransaction = (msg) => {
    const lower = msg.toLowerCase();

    if (lower.includes('otp')) return false;
    if (lower.includes('low balance')) return false;
    if (lower.includes('available balance')) return false;

    return true;
};

const parseSMS = (msg) => {
    if (!isValidTransaction(msg)) return null;

    const type = detectType(msg);
    const amount = extractAmount(msg);
    const account = extractAccount(msg);
    const bank = extractBank(msg);
    const source = extractSource(msg, type);
    const date = extractDate(msg);

    return {
        type,
        amount,
        bank_name: bank,
        account_mask: account.account_mask,
        source_name: source.source_name,
        source_vpa: source.source_vpa,
        date
    };
};

async function resolveMerchant(userId, parsed) {
    let rawName = parsed.source_name || parsed.source_vpa;

    if (!rawName) return null;

    const normalized_key = normalize(rawName);

    let merchant = await MerchantAlias.findOne({
        user: userId,
        normalized_key
    });

    if (!merchant) {
        let category_id = null;
        for (let rule of categoryRules) {
            if (normalized_key.includes(rule.keyword)) {
                let category = await Category.findOne({
                    name: rule.name
                });

                if (!category) {
                    category = await Category.create({
                        user: userId,
                        name: rule.name
                    });
                }


                category_id = category._id;
            }
        }
        merchant = await MerchantAlias.create({
            user: userId,
            normalized_key,
            original_name: rawName,
            alias_name: rawName,
            category_id: category_id
        });
    }

    return merchant;
}

const categoryRules = [
    { keyword: 'tasmac', name: 'Alcohol' },
    { keyword: 'swiggy', name: 'Food' },
    { keyword: 'zomato', name: 'Food' },
    { keyword: 'dominos', name: 'Food' },
    { keyword: 'mcdonalds', name: 'Food' },
    { keyword: 'restaurant', name: 'Food' },
    { keyword: 'briyani', name: 'Food' },
    { keyword: 'food', name: 'Food' },
    { keyword: 'dhaba', name: 'Food' },
    { keyword: 'uber', name: 'Transport' },
    { keyword: 'ola', name: 'Transport' },
    { keyword: 'metro', name: 'Transport' },
    { keyword: 'metro', name: 'Transport' },
    { keyword: 'irctc', name: 'Transport' },
    { keyword: 'rapido', name: 'Transport' },
    { keyword: 'salary', name: 'Income' },
    { keyword: 'amazon', name: 'Shopping' },
    { keyword: 'flipkart', name: 'Shopping' },
    { keyword: 'reliance', name: 'Shopping' },
    { keyword: 'ajio', name: 'Shopping' },
    { keyword: 'meesho', name: 'Shopping' },
    { keyword: 'myntra', name: 'Shopping' },
    { keyword: 'petrol', name: 'Fuel' },
    { keyword: 'petro', name: 'Fuel' },
    { keyword: 'shell', name: 'Fuel' },
    { keyword: 'hpcl', name: 'Fuel' },
    { keyword: 'indian oil', name: 'Fuel' },
    { keyword: 'diesel', name: 'Fuel' },
    { keyword: 'hathway', name: 'Internet and phone bills' },
    { keyword: 'airtel', name: 'Internet and phone bills' },
    { keyword: 'jio', name: 'Internet and phone bills' },
    { keyword: 'zepto', name: 'snacks & groceries' },
    { keyword: 'blinkit', name: 'snacks & groceries' },
    { keyword: 'fastag', name: 'highway toll' },
    { keyword: 'netflix', name: 'OTT and Entertainment' },
    { keyword: 'cinema', name: 'OTT and Entertainment' },
    { keyword: 'spotify', name: 'OTT and Entertainment' },
    { keyword: 'apple media', name: 'OTT and Entertainment' },
    { keyword: 'jiohotstar', name: 'OTT and Entertainment' },
    { keyword: 'pvr', name: 'OTT and Entertainment' },
    { keyword: 'bookmyshow', name: 'OTT and Entertainment' },
    { keyword: 'district', name: 'OTT and Entertainment' },
    { keyword: 'youtube', name: 'OTT and Entertainment' },
    { keyword: 'steam', name: 'OTT and Entertainment' },
    { keyword: 'epicgames', name: 'OTT and Entertainment' },

];

async function resolveCategory(userId, merchant) {
    if (!merchant) return null;

    if (merchant.category_id) return merchant.category_id;

    const key = merchant.normalized_key;

    for (let rule of categoryRules) {
        if (key.includes(rule.keyword)) {
            let category = await Category.findOne({
                name: rule.name
            });

            if (!category) {
                category = await Category.create({
                    user: userId,
                    name: rule.name
                });
            }

            merchant.category_id = category._id;
            await merchant.save();

            return category._id;
        }
    }

    return null;
}


const isTransactionMessage = (msg) => {
    const lower = msg.toLowerCase();

    if (
        lower.includes('otp') ||
        lower.includes('one time password') ||
        lower.includes('available balance') ||
        lower.includes('minimum balance') ||
        lower.includes('emi due') ||
        lower.includes('reward') ||
        lower.includes('offer') ||
        lower.includes('cashback') ||
        lower.includes('transaction failed') ||
        lower.includes('failed') ||
        lower.includes('declined') ||
        lower.includes('cancelled')
    ) {
        return false;
    }

    const hasAmount =
        /(?:Rs\.?|INR)\s?[\d,]+\.\d+/i.test(msg);

    if (!hasAmount) return false;

    return true;
};

module.exports = { parseSMS, resolveMerchant, resolveCategory, isTransactionMessage, normalize };