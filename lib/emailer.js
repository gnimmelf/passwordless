var nodemailer = require('nodemailer');
var credentials = require('upquire')('/credentials/email')

// create reusable transporter object using SMTP transport
var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: credentials.user,
        pass: credentials.pass,
    }
});

// NB! No need to recreate the transporter object. You can use
// the same transporter object for all e-mails

exports.sendTokenEmail = function(sender_name, reciever_email, subject_str, body) {

  // setup e-mail data with unicode symbols
  var mailOptions = {
      from: sender_name + ' <'+ credentials.senderEmail +'>',
      to: reciever_email,
      subject: subject_str,
      text: body,
      //html: '<b>Hello world ✔</b>'
  };

  // send mail with defined transport object
  transporter.sendMail(mailOptions, function(error, info){
      if(error){
        console.log(error);
        console.log('Fail email details:', mailOptions)
      }else{
        console.log('Message sent: ' + info.response);
      }
  });

}


