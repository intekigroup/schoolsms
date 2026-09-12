#!/bin/bash
# Verifies the new role guards: what each demo account can and cannot do.
B=http://127.0.0.1:3000
cd "$(mktemp -d)"  # cookie jars go somewhere disposable

login() { # $1=email $2=pass $3=jar
  rm -f "$3"
  local csrf
  csrf=$(curl -s -c "$3" --max-time 60 $B/api/auth/csrf | sed -E 's/.*"csrfToken":"([^"]*)".*/\1/')
  curl -s -b "$3" -c "$3" -o /dev/null --max-time 90 -X POST \
    $B/api/auth/callback/credentials \
    -d "csrfToken=$csrf&email=$1&password=$2&callbackUrl=$B/dashboard"
  grep -q "session-token" "$3" && echo "  logged in as $1" || echo "  LOGIN FAILED for $1"
}

code()  { curl -s -b "$1" -o /dev/null -w "%{http_code}" --max-time 90 "$B$2"; }
wcode() { curl -s -b "$1" -o /dev/null -w "%{http_code}" --max-time 90 -X "$2" "$B$3" \
            -H 'Content-Type: application/json' -d "${4:-\{\}}"; }
# Final URL after redirects, to prove a page guard bounced the user.
dest()  { curl -s -b "$1" -o /dev/null -w "%{url_effective}" -L --max-time 90 "$B$2" | sed "s|$B||"; }

pass=0; fail=0
check() { # $1=label $2=actual $3=expected
  if [ "$2" = "$3" ]; then echo "  PASS  $1 -> $2"; pass=$((pass+1))
  else echo "  FAIL  $1 -> got $2, want $3"; fail=$((fail+1)); fi
}

echo "== PARENT (parent@kilimanjaro.tz) =="
login parent@kilimanjaro.tz parent123 jar-parent.txt
check "DELETE /api/students"        "$(wcode jar-parent.txt DELETE '/api/students?id=x')" 403
check "POST   /api/students"        "$(wcode jar-parent.txt POST '/api/students' '{"firstName":"a","lastName":"b","admissionNo":"z1"}')" 403
check "POST   /api/fees/payment"    "$(wcode jar-parent.txt POST '/api/fees/payment')" 403
check "POST   /api/exams/results"   "$(wcode jar-parent.txt POST '/api/exams/results')" 403
check "POST   /api/attendance"      "$(wcode jar-parent.txt POST '/api/attendance' '{"entries":[{"studentId":"x","date":"2026-01-01","status":"PRESENT"}]}')" 403
check "PUT    /api/settings"        "$(wcode jar-parent.txt PUT '/api/settings')" 403
check "POST   /api/announcements"   "$(wcode jar-parent.txt POST '/api/announcements')" 403
check "GET    /api/students"        "$(code  jar-parent.txt '/api/students')" 403
check "GET    /api/reports/export"  "$(code  jar-parent.txt '/api/reports/export?type=students')" 403
check "page   /dashboard/fees"      "$(dest  jar-parent.txt '/dashboard/fees')" /dashboard/parents
check "page   /dashboard/students"  "$(dest  jar-parent.txt '/dashboard/students')" /dashboard/parents
check "own    /api/notifications"   "$(code  jar-parent.txt '/api/notifications')" 200

echo "== SCHOOL_ADMIN (admin@kilimanjaro.tz) =="
login admin@kilimanjaro.tz admin123 jar-admin.txt
check "GET    /api/students"        "$(code jar-admin.txt '/api/students')" 200
check "GET    /api/reports/export"  "$(code jar-admin.txt '/api/reports/export?type=students')" 200
check "page   /dashboard/fees"      "$(dest jar-admin.txt '/dashboard/fees')" /dashboard/fees
check "page   /dashboard/settings"  "$(dest jar-admin.txt '/dashboard/settings')" /dashboard/settings
check "page   /dashboard/students"  "$(dest jar-admin.txt '/dashboard/students')" /dashboard/students
check "POST   /api/schools (403)"   "$(wcode jar-admin.txt POST '/api/schools' '{"name":"x"}')" 403
check "page   /dashboard/super-adm" "$(dest jar-admin.txt '/dashboard/super-admin')" /dashboard

echo "== SUPER_ADMIN (super@shulesms.tz) =="
login super@shulesms.tz super123 jar-super.txt
check "page   /dashboard/super-adm" "$(dest jar-super.txt '/dashboard/super-admin')" /dashboard/super-admin

echo "== ANONYMOUS =="
rm -f jar-anon.txt; touch jar-anon.txt
check "GET    /api/students"        "$(code  jar-anon.txt '/api/students')" 401
check "DELETE /api/students"        "$(wcode jar-anon.txt DELETE '/api/students?id=x')" 401
check "dead   /api/auth/login"      "$(wcode jar-anon.txt POST '/api/auth/login' '{"email":"admin@kilimanjaro.tz","password":"admin123"}')" 400

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
