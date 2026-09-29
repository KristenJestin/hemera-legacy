# Temporary (#253): runs the tests given with the processor sampled and every child traced.
mkdir -p "$HEMERA_SPAWN_TRACE"
node .github/diagnostics/cpu.mjs "$HEMERA_SPAWN_TRACE/cpu.txt" &
sampler=$!
echo "temporary folder: $(node -p 'require("os").tmpdir()')"
status=0
pnpm exec vp test run "$@" --reporter=default --reporter=json --outputFile.json="$HEMERA_SPAWN_TRACE/vitest.json" || status=$?
kill $sampler
exit $status
