# Temporary (#253): runs the tests given with the processor, and on Windows the disks, sampled.
mkdir -p "$HEMERA_SPAWN_TRACE"
node .github/diagnostics/cpu.mjs "$HEMERA_SPAWN_TRACE/cpu.txt" &
sampler=$!
if [ "$RUNNER_OS" = Windows ]; then
  typeperf "\\PhysicalDisk(*)\\% Idle Time" "\\PhysicalDisk(*)\\Avg. Disk sec/Write" "\\PhysicalDisk(*)\\Avg. Disk sec/Read" "\\PhysicalDisk(*)\\Disk Writes/sec" "\\PhysicalDisk(*)\\Current Disk Queue Length" -si 2 -o "$(cygpath -w "$HEMERA_SPAWN_TRACE")\\disk.csv" -y >/dev/null &
  disks=$!
fi
echo "temporary folder: $(node -p 'require("os").tmpdir()')"
status=0
pnpm exec vp test run "$@" --reporter=verbose --reporter=json --outputFile.json="$HEMERA_SPAWN_TRACE/vitest.json" || status=$?
kill $sampler
[ -n "$disks" ] && kill $disks 2>/dev/null
exit $status
