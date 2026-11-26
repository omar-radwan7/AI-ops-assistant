# Runbook: High memory
1. Find the processes using the most memory: `ps aux --sort=-%mem | head`.
2. Check for a memory leak: does one process grow steadily over hours?
3. Restart the leaking service during a quiet time and open a bug for its owner.
4. Check swap usage: heavy swapping makes the whole server slow.
