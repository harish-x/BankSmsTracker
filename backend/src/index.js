const { app } = require('@azure/functions');

app.setup({
    enableHttpStream: true,
});

require('./functions/accounts');
require('./functions/auth');
require('./functions/expensemetric');
require("./functions/statistics")
require("./functions/transaction")

module.exports = app;
