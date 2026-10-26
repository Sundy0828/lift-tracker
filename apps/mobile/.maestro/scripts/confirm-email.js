// Confirms the address through the real verification link, as the web's
// signUp.ts does: the Auth emulator keeps the codes it would have emailed.
var host =
  typeof AUTH_EMULATOR === 'undefined' || AUTH_EMULATOR === ''
    ? 'http://127.0.0.1:9099'
    : AUTH_EMULATOR;
var project =
  typeof PROJECT_ID === 'undefined' || PROJECT_ID === '' ? 'lift-tracker-e4a9c' : PROJECT_ID;

var response = http.get(host + '/emulator/v1/projects/' + project + '/oobCodes');
var codes = json(response.body).oobCodes.filter(function (code) {
  return code.email === EMAIL && code.requestType === 'VERIFY_EMAIL';
});
if (codes.length === 0) throw new Error('No verification link was issued for ' + EMAIL);
// Resends invalidate earlier codes, so the newest is the live one.
var visited = http.get(codes[codes.length - 1].oobLink);
if (visited.status >= 400) throw new Error('The verification link was refused');
