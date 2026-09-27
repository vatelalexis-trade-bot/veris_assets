# Test mail box of the online demonstration (Railway, D-106): every email is captured, none is
# sent. The web interface is protected by a password given in MAILPIT_UI_PASSWORD (user "demo").
FROM axllent/mailpit:v1.31.2
ENTRYPOINT ["sh", "-c", "test -n \"$MAILPIT_UI_PASSWORD\" || { echo 'MAILPIT_UI_PASSWORD is missing' >&2; exit 1; }; printf 'demo:%s\\n' \"$MAILPIT_UI_PASSWORD\" > /tmp/ui-auth && exec /mailpit --ui-auth-file /tmp/ui-auth --listen [::]:${PORT:-8025} --smtp [::]:1025"]
