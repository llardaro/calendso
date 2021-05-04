
const {google} = require('googleapis');
const credentials = process.env.GOOGLE_API_CREDENTIALS;
const nodemailer = require("nodemailer");

const googleAuth = () => {
    const {client_secret, client_id, redirect_uris} = JSON.parse(process.env.GOOGLE_API_CREDENTIALS).web;
    return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
};

function handleErrors(response) {
    if (!response.ok) {
        response.json().then( console.log );
        throw Error(response.statusText);
    }
    return response.json();
}


const o365Auth = (credential) => {

    const isExpired = (expiryDate) => expiryDate < +(new Date());

    const refreshAccessToken = (refreshToken) => fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            'scope': 'User.Read Calendars.Read Calendars.ReadWrite',
            'client_id': process.env.MS_GRAPH_CLIENT_ID,
            'refresh_token': refreshToken,
            'grant_type': 'refresh_token',
            'client_secret': process.env.MS_GRAPH_CLIENT_SECRET,
        })
    })
    .then(handleErrors)
    .then( (responseBody) => {
        credential.key.access_token = responseBody.access_token;
        credential.key.expiry_date = Math.round((+(new Date()) / 1000) + responseBody.expires_in);
        return credential.key.access_token;
    })

    return {
        getToken: () => ! isExpired(credential.key.expiry_date) ? Promise.resolve(credential.key.access_token) : refreshAccessToken(credential.key.refresh_token)
    };
};

interface CalendarEvent {
    title: string;
    startTime: string;
    timeZone: string;
    endTime: string;
    description?: string;
    organizer: { name?: string, email?: string, picture?: string };
    attendees: { name?: string, email: string }[];
};

const MicrosoftOffice365Calendar = (credential) => {

    const auth = o365Auth(credential);

    const translateEvent = (event: CalendarEvent) => ({
        subject: event.title,
        body: {
            contentType: 'HTML',
            content: event.description,
        },
        start: {
            dateTime: event.startTime,
            timeZone: event.timeZone,
        },
        end: {
            dateTime: event.endTime,
            timeZone: event.timeZone,
        },
        attendees: event.attendees.map(attendee => ({
            emailAddress: {
                address: attendee.email,
                name: attendee.name
            },
            type: "required"
        }))
    });

    return {
        getAvailability: (dateFrom, dateTo) => {
            const payload = {
                schedules: [ credential.key.email ],
                startTime: {
                    dateTime: dateFrom,
                    timeZone: 'UTC',
                },
                endTime: {
                    dateTime: dateTo,
                    timeZone: 'UTC',
                },
                availabilityViewInterval: 60
            };

            return auth.getToken().then(
                (accessToken) => fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
                    method: 'post',
                    headers: {
                        'Authorization': 'Bearer ' + accessToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                })
                .then(handleErrors)
                .then( responseBody => {
                    return responseBody.value[0].scheduleItems.map( (evt) => ({ start: evt.start.dateTime + 'Z', end: evt.end.dateTime + 'Z' }))
                })
            ).catch( (err) => {
                console.log(err);
            });
        },
        createEvent: (event: CalendarEvent) => auth.getToken().then( accessToken => fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(translateEvent(event))
        }))
    }
};

function getRandomString(length) {
    var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for ( var i = 0; i < length; i++ ) {
        result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    }
    return result;
}

const GoogleCalendar = (credential) => {
    const myGoogleAuth = googleAuth();
    myGoogleAuth.setCredentials(credential.key);
    return {
        getAvailability: (dateFrom, dateTo) => new Promise( (resolve, reject) => {
            const calendar = google.calendar({ version: 'v3', auth: myGoogleAuth });
            calendar.freebusy.query({
                requestBody: {
                    timeMin: dateFrom,
                    timeMax: dateTo,
                    items: [ {
                        "id": "primary"
                    } ]
                }
            }, (err, apires) => {
                if (err) {
                    reject(err);
                }
                resolve(apires.data.calendars.primary.busy)
            });
        }),
        createEvent: (event: CalendarEvent) => new Promise( (resolve, reject) => {
            const payload = {
                summary: event.title,
                description: event.description,
                start: {
                    dateTime: event.startTime,
                    timeZone: event.timeZone,
                },
                end: {
                    dateTime: event.endTime,
                    timeZone: event.timeZone,
                },
                attendees: event.attendees,
                reminders: {
                    useDefault: false,
                    overrides: [
                        {'method': 'email', 'minutes': 60}
                    ],
                },
                conferenceData: {
                    createRequest: {
                        conferenceSolutionKey: {
                          type: 'hangoutsMeet'
                        },
                        requestId: getRandomString(7)
                    }
                }
            };

            const organizerData = {
                name: event.organizer.name,
                avatar: event.organizer.picture
            }

            const calendar = google.calendar({version: 'v3', auth: myGoogleAuth });
            calendar.events.insert({
                auth: myGoogleAuth,
                calendarId: 'primary',
                conferenceDataVersion: 1,
                resource: payload,
            }, function(err, event) {
                if (err) {
                    console.log('There was an error contacting the Calendar service: ' + err);
                    return reject(err);
                }
                // SEND EMAIL ============
                let transporter = nodemailer.createTransport({
                    host: "mail5018.site4now.net",
                    port: 465,
                    secure: true,
                    auth: {
                    user: 'no-reply@itcamerica.net',
                    pass: '1tc@2020',
                    },
                });
                let receiversList = '';
                payload.attendees.forEach(element => {
                    receiversList += element.email + ',';
                });

                //Body html
                //'+event.data.hangoutLink+' event.data.hangoutLink
                //'+organizerData.avatar+' organizerData.avatar
                //'+event.data.start.dateTime+' event.data.start.dateTime event.data.start.timeZone
                //'+organizerData.name+' organizerData.name
                var messageBody = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml"><head><meta content="text/html; charset=utf-8" http-equiv="Content-Type"/><meta content="width=device-width" name="viewport"/><meta content="IE=edge" http-equiv="X-UA-Compatible"/><title></title><style type="text/css">body{margin: 0;padding: 0;}table,td,tr{vertical-align: top;border-collapse: collapse;}*{line-height: inherit;}a[x-apple-data-detectors=true]{color: inherit !important;text-decoration: none !important;}</style><style id="media-query" type="text/css">@media (max-width: 660px){.block-grid,.col{min-width: 320px !important;max-width: 100% !important;display: block !important;}.block-grid{width: 100% !important;}.col{width: 100% !important;}.col_cont{margin: 0 auto;}img.fullwidth,img.fullwidthOnMobile{max-width: 100% !important;}.no-stack .col{min-width: 0 !important;display: table-cell !important;}.no-stack.two-up .col{width: 50% !important;}.no-stack .col.num2{width: 16.6% !important;}.no-stack .col.num3{width: 25% !important;}.no-stack .col.num4{width: 33% !important;}.no-stack .col.num5{width: 41.6% !important;}.no-stack .col.num6{width: 50% !important;}.no-stack .col.num7{width: 58.3% !important;}.no-stack .col.num8{width: 66.6% !important;}.no-stack .col.num9{width: 75% !important;}.no-stack .col.num10{width: 83.3% !important;}.video-block{max-width: none !important;}.mobile_hide{min-height: 0px;max-height: 0px;max-width: 0px;display: none;overflow: hidden;font-size: 0px;}.desktop_hide{display: block !important;max-height: none !important;}}</style><style id="icon-media-query" type="text/css">@media (max-width: 660px){.icons-inner{text-align: center;}.icons-inner td{margin: 0 auto;}}</style></head><body class="clean-body" style="margin: 0; padding: 0; -webkit-text-size-adjust: 100%; background-color: #f1f1f1;"><table bgcolor="#f1f1f1" cellpadding="0" cellspacing="0" class="nl-container" role="presentation" style="table-layout: fixed; vertical-align: top; min-width: 320px; border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #f1f1f1; width: 100%;" valign="top" width="100%"><tbody><tr style="vertical-align: top;" valign="top"><td style="word-break: break-word; vertical-align: top;" valign="top"><div style="background-color:#040b18;"><div class="block-grid" style="min-width: 320px; max-width: 640px; overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; Margin: 0 auto; background-color: #040b18;"><div style="border-collapse: collapse;display: table;width: 100%;background-color:#040b18;"><div class="col num12" style="min-width: 320px; max-width: 640px; display: table-cell; vertical-align: top; width: 640px;"><div class="col_cont" style="width:100% !important;"><div style="border-top:0px solid transparent; border-left:0px solid transparent; border-bottom:0px solid transparent; border-right:0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><table border="0" cellpadding="0" cellspacing="0" class="divider" role="presentation" style="table-layout: fixed; vertical-align: top; border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; min-width: 100%; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;" valign="top" width="100%"><tbody><tr style="vertical-align: top;" valign="top"><td class="divider_inner" style="word-break: break-word; vertical-align: top; min-width: 100%; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; padding-top: 10px; padding-right: 10px; padding-bottom: 10px; padding-left: 10px;" valign="top"><table align="center" border="0" cellpadding="0" cellspacing="0" class="divider_content" height="0" role="presentation" style="table-layout: fixed; vertical-align: top; border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-top: 0px solid transparent; height: 0px; width: 100%;" valign="top" width="100%"><tbody><tr style="vertical-align: top;" valign="top"><td height="0" style="word-break: break-word; vertical-align: top; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;" valign="top"><span></span></td></tr></tbody></table></td></tr></tbody></table></div></div></div></div></div></div><div style="background-color:#040b18;"><div class="block-grid" style="min-width: 320px; max-width: 640px; overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; Margin: 0 auto; background-color: #ffffff;"><div style="border-collapse: collapse;display: table;width: 100%;background-color:#ffffff;"><div class="col num12" style="min-width: 320px; max-width: 640px; display: table-cell; vertical-align: top; width: 640px;"><div class="col_cont" style="width:100% !important;"><div style="border-top:0px solid transparent; border-left:0px solid transparent; border-bottom:0px solid transparent; border-right:0px solid transparent; padding-top:15px; padding-bottom:15px; padding-right: 0px; padding-left: 0px;"><div align="center" class="img-container center fixedwidth" style="padding-right: 0px;padding-left: 0px;"><a href="https://itcamerica.net" style="outline:none" tabindex="-1" target="_blank"><img align="center" alt="Logo" border="0" class="center fixedwidth" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/ITC.png" style="text-decoration: none; -ms-interpolation-mode: bicubic; height: auto; border: 0; width: 100%; max-width: 160px; display: block;" title="Logo" width="160"/></a></div></div></div></div></div></div></div><div style="background-color:#040b18;"><div class="block-grid two-up" style="min-width: 320px; max-width: 640px; overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; Margin: 0 auto; background-color: #ffffff;"><div style="border-collapse: collapse;display: table;width: 100%;background-color:#ffffff;"><div class="col num6" style="display: table-cell; vertical-align: top; max-width: 320px; min-width: 318px; width: 320px;"><div class="col_cont" style="width:100% !important;"><div style="border-top:0px solid transparent; border-left:0px solid transparent; border-bottom:0px solid transparent; border-right:0px solid transparent; padding-top:10px; padding-bottom:5px; padding-right: 35px; padding-left: 35px;"><div align="left" class="img-container left autowidth" style="padding-right: 0px;padding-left: 0px;"><a href="#" style="outline:none" tabindex="-1" target="_blank"><img alt="Picture" border="0" class="left autowidth" src="'+organizerData.avatar+'" style="text-decoration: none; -ms-interpolation-mode: bicubic; height: auto; border: 0; width: 100%; max-width: 65px; display: block;" title="Picture" width="65"/></a></div><div style="color:#555555;font-family:Poppins, Arial, Helvetica, sans-serif;line-height:1.2;padding-top:10px;padding-right:0px;padding-bottom:0px;padding-left:0px;"><div class="txtTinyMce-wrapper" style="font-size: 14px; line-height: 1.2; color: #555555; font-family: Poppins, Arial, Helvetica, sans-serif; mso-line-height-alt: 17px;"><p style="margin: 0; font-size: 14px; line-height: 1.2; word-break: break-word; mso-line-height-alt: 17px; margin-top: 0; margin-bottom: 0;">Google Meets</p></div></div><div style="color:#80c1d8;font-family:Poppins, Arial, Helvetica, sans-serif;line-height:1.2;padding-top:10px;padding-right:0px;padding-bottom:10px;padding-left:0px;"><div class="txtTinyMce-wrapper" style="font-size: 14px; line-height: 1.2; color: #80c1d8; font-family: Poppins, Arial, Helvetica, sans-serif; mso-line-height-alt: 17px;"><p style="margin: 0; font-size: 30px; line-height: 1.2; word-break: break-word; mso-line-height-alt: 36px; margin-top: 0; margin-bottom: 0;"><span style="font-size: 30px; color: #808080;"><strong>You booked a call with '+organizerData.name+':</strong></span></p></div></div><div style="color:#80c1d8;font-family:Poppins, Arial, Helvetica, sans-serif;line-height:1.2;padding-top:5px;padding-right:0px;padding-bottom:0px;padding-left:0px;"><div class="txtTinyMce-wrapper" style="font-size: 14px; line-height: 1.2; color: #80c1d8; font-family: Poppins, Arial, Helvetica, sans-serif; mso-line-height-alt: 17px;"><p style="margin: 0; font-size: 13px; line-height: 1.2; word-break: break-word; mso-line-height-alt: 16px; mso-ansi-font-size: 14px; margin-top: 0; margin-bottom: 0;"><span style="font-size: 13px; color: #999999; mso-ansi-font-size: 14px;">When & How to Connect with us:</span></p></div></div><div style="color:#808080;font-family:Poppins, Arial, Helvetica, sans-serif;line-height:2;padding-top:5px;padding-right:0px;padding-bottom:10px;padding-left:0px;"><div class="txtTinyMce-wrapper" style="font-size: 14px; line-height: 2; color: #808080; font-family: Poppins, Arial, Helvetica, sans-serif; mso-line-height-alt: 28px;"><p style="margin: 0; font-size: 14px; line-height: 2; word-break: break-word; mso-line-height-alt: 28px; margin-top: 0; margin-bottom: 0;">📅 <span style="font-size: 16px;">'+event.data.start.dateTime+'</span></p><p style="margin: 0; font-size: 14px; line-height: 2; word-break: break-word; mso-line-height-alt: 28px; margin-top: 0; margin-bottom: 0;">🔗 <span style="font-size: 16px;"><a href="'+event.data.hangoutLink+'" rel="noopener" style="text-decoration: none; color: #808080;" target="_blank">'+event.data.hangoutLink+'</a></span></p><p style="margin: 0; font-size: 14px; line-height: 2; word-break: break-word; mso-line-height-alt: 28px; margin-top: 0; margin-bottom: 0;">📱 <span style="font-size: 16px;"><a href="tel:+17549005149" style="text-decoration: none; color: #808080;" title="tel:+17549005149">+1 (754) 900 5149</a></span></p></div></div><div align="left" class="button-container" style="padding-top:0px;padding-right:0px;padding-bottom:10px;padding-left:0px;"><a href="'+event.data.hangoutLink+'" style="-webkit-text-size-adjust: none; text-decoration: none; display: inline-block; color: #ffffff; background-color: #2a46ff; border-radius: 4px; -webkit-border-radius: 4px; -moz-border-radius: 4px; width: auto; width: auto; border-top: 1px solid #2a46ff; border-right: 1px solid #2a46ff; border-bottom: 1px solid #2a46ff; border-left: 1px solid #2a46ff; padding-top: 5px; padding-bottom: 5px; font-family: Poppins, Arial, Helvetica, sans-serif; text-align: center; mso-border-alt: none; word-break: keep-all;" target="_blank"><span style="padding-left:25px;padding-right:25px;font-size:14px;display:inline-block;letter-spacing:undefined;"><span style="font-size: 16px; line-height: 2; word-break: break-word; mso-line-height-alt: 32px;"><span data-mce-style="font-size: 14px; line-height: 28px;" style="font-size: 14px; line-height: 28px;">Join!</span></span></span></a></div></div></div></div><div class="col num6" style="display: table-cell; vertical-align: top; max-width: 320px; min-width: 318px; width: 320px;"><div class="col_cont" style="width:100% !important;"><div style="border-top:0px solid transparent; border-left:0px solid transparent; border-bottom:0px solid transparent; border-right:0px solid transparent; padding-top:10px; padding-bottom:0px; padding-right: 0px; padding-left: 0px;"><div align="right" class="img-container right autowidth" style="padding-right: 0px;padding-left: 0px;"><img align="right" alt="Image" border="0" class="right autowidth" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/featured-image.png" style="text-decoration: none; -ms-interpolation-mode: bicubic; height: auto; border: 0; width: 100%; max-width: 254px; float: none; display: block;" title="Image" width="254"/></div></div></div></div></div></div></div><div style="background-color:#040b18;"><div class="block-grid" style="min-width: 320px; max-width: 640px; overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; Margin: 0 auto; background-color: #040b18;"><div style="border-collapse: collapse;display: table;width: 100%;background-color:#040b18;"><div class="col num12" style="min-width: 320px; max-width: 640px; display: table-cell; vertical-align: top; width: 640px;"><div class="col_cont" style="width:100% !important;"><div style="border-top:0px solid transparent; border-left:0px solid transparent; border-bottom:0px solid transparent; border-right:0px solid transparent; padding-top:10px; padding-bottom:20px; padding-right: 0px; padding-left: 0px;"><div style="color:#ffffff;font-family:Poppins, Arial, Helvetica, sans-serif;line-height:1.2;padding-top:25px;padding-right:10px;padding-bottom:5px;padding-left:10px;"><div class="txtTinyMce-wrapper" style="font-size: 14px; line-height: 1.2; color: #ffffff; font-family: Poppins, Arial, Helvetica, sans-serif; mso-line-height-alt: 17px;"><p style="margin: 0; font-size: 18px; line-height: 1.2; word-break: break-word; text-align: center; mso-line-height-alt: 22px; margin-top: 0; margin-bottom: 0;"><span style="font-size: 18px;">FOLLOW US:</span></p></div></div><table cellpadding="0" cellspacing="0" class="social_icons" role="presentation" style="table-layout: fixed; vertical-align: top; border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;" valign="top" width="100%"><tbody><tr style="vertical-align: top;" valign="top"><td style="word-break: break-word; vertical-align: top; padding-top: 10px; padding-right: 10px; padding-bottom: 10px; padding-left: 10px;" valign="top"><table align="center" cellpadding="0" cellspacing="0" class="social_table" role="presentation" style="table-layout: fixed; vertical-align: top; border-spacing: 0; border-collapse: collapse; mso-table-tspace: 0; mso-table-rspace: 0; mso-table-bspace: 0; mso-table-lspace: 0;" valign="top"><tbody><tr align="center" style="vertical-align: top; display: inline-block; text-align: center;" valign="top"><td style="word-break: break-word; vertical-align: top; padding-bottom: 0; padding-right: 7.5px; padding-left: 7.5px;" valign="top"><a href="https://www.facebook.com/ITCAmerica/" target="_blank"><img alt="Facebook" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/facebook2x.png" style="text-decoration: none; -ms-interpolation-mode: bicubic; height: auto; border: 0; display: block;" title="Facebook" width="32"/></a></td><td style="word-break: break-word; vertical-align: top; padding-bottom: 0; padding-right: 7.5px; padding-left: 7.5px;" valign="top"><a href="https://www.instagram.com/itcamerica/" target="_blank"><img alt="Instagram" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/instagram2x.png" style="text-decoration: none; -ms-interpolation-mode: bicubic; height: auto; border: 0; display: block;" title="Instagram" width="32"/></a></td><td style="word-break: break-word; vertical-align: top; padding-bottom: 0; padding-right: 7.5px; padding-left: 7.5px;" valign="top"><a href="https://www.linkedin.com/company/itc-america" target="_blank"><img alt="LinkedIn" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/linkedin2x.png" style="text-decoration: none; -ms-interpolation-mode: bicubic; height: auto; border: 0; display: block;" title="LinkedIn" width="32"/></a></td></tr></tbody></table></td></tr></tbody></table><div style="color:#ffffff;font-family:Poppins, Arial, Helvetica, sans-serif;line-height:1.8;padding-top:10px;padding-right:10px;padding-bottom:10px;padding-left:10px;"><div class="txtTinyMce-wrapper" style="font-size: 14px; line-height: 1.8; color: #ffffff; font-family: Poppins, Arial, Helvetica, sans-serif; mso-line-height-alt: 25px;"><p style="margin: 0; font-size: 14px; line-height: 1.8; word-break: break-word; text-align: center; mso-line-height-alt: 25px; margin-top: 0; margin-bottom: 0;"><a href="tel:+17549005149" style="text-decoration: none; color: #ffffff;" title="tel:+17549005149">+1 (754) 900 5149</a></p><p style="margin: 0; font-size: 14px; line-height: 1.8; word-break: break-word; text-align: center; mso-line-height-alt: 25px; margin-top: 0; margin-bottom: 0;"><a href="http://itcamerica.net" rel="noopener" style="text-decoration: none; color: #ffffff;" target="_blank">www.itcamerica.net</a></p><p style="margin: 0; font-size: 14px; line-height: 1.8; word-break: break-word; text-align: center; mso-line-height-alt: 25px; margin-top: 0; margin-bottom: 0;">652 N University Drive, Pembroke Pines, Florida USA</p></div></div><table border="0" cellpadding="0" cellspacing="0" class="divider" role="presentation" style="table-layout: fixed; vertical-align: top; border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; min-width: 100%; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;" valign="top" width="100%"><tbody><tr style="vertical-align: top;" valign="top"><td class="divider_inner" style="word-break: break-word; vertical-align: top; min-width: 100%; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; padding-top: 10px; padding-right: 10px; padding-bottom: 10px; padding-left: 10px;" valign="top"><table align="center" border="0" cellpadding="0" cellspacing="0" class="divider_content" role="presentation" style="table-layout: fixed; vertical-align: top; border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-top: 1px solid #2A46FF; width: 100%;" valign="top" width="100%"><tbody><tr style="vertical-align: top;" valign="top"><td style="word-break: break-word; vertical-align: top; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;" valign="top"><span></span></td></tr></tbody></table></td></tr></tbody></table></div></div></div></div></div></div></td></tr></tbody></table></body></html>';
                // send mail with defined transport object
                transporter.sendMail({
                    from: '"ITC America" <no-reply@itcamerica.net>', // sender address
                    to: receiversList, // list of receivers
                    subject: "You booked a call with us!", // Subject line
                    text: 'You booked a call with ' + organizerData.name + '. Meeting date: ' + event.data.start.dateTime + '. Meeting link: ' + event.data.hangoutLink, // plain text body
                    html: messageBody, // html body
                });

                console.log('DATOS DEL EVENTO =====================');
                console.log(event.data);

                return resolve(event.data);
            });
        })
    };
};

// factory
const calendars = (withCredentials): [] => withCredentials.map( (cred) => {
    switch(cred.type) {
        case 'google_calendar': return GoogleCalendar(cred);
        case 'office365_calendar': return MicrosoftOffice365Calendar(cred);
        default:
            return; // unknown credential, could be legacy? In any case, ignore
    }
}).filter(Boolean);


const getBusyTimes = (withCredentials, dateFrom, dateTo) => Promise.all(
    calendars(withCredentials).map( c => c.getAvailability(dateFrom, dateTo) )
).then(
    (results) => results.reduce( (acc, availability) => acc.concat(availability) )
);

const createEvent = (credential, evt: CalendarEvent) => calendars([ credential ])[0].createEvent(evt);

export { getBusyTimes, createEvent, CalendarEvent };
