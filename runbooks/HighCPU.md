# Runbook: High CPU
1. Find the processes using the most CPU: `top -o %CPU` or `ps aux --sort=-%cpu | head`.
2. Check if a known batch job, backup or build is running and when it ends.
3. If one process is stuck in a loop, restart that service, not the whole server.
4. If load is real customer traffic, scale out or move workloads.
