// A fresh account per run: a rerun must never collide with an earlier one.
// The password meets the policy (`@lift/domain/password`), as signUp.ts's does.
var prefix = typeof PREFIX === 'undefined' || PREFIX === '' ? 'maestro' : PREFIX;
output.email =
  prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 100000) + '@example.com';
output.password = 'Lift$Tracker1';
