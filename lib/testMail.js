#!/usr/bin/env node

'use strict';

const nodemailer = require("nodemailer");

(async() => {
  let transport = nodemailer.createTransport({
    host: 'postfix',
    port: 25,
  });

  await transport.sendMail({
//    from: '"Fred Foo 👻" <foo@example.com>', // sender address
    to: 'stefan@heine7.de',
    subject: 'Hello ✔',
    text: 'Hello world?',
    html: '<b>Hello world?</b>',
  });
})();
