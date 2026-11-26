# Runbook: Disk almost full
1. Find the biggest folders: `sudo du -xh / --max-depth=2 | sort -rh | head -20`.
2. Check logs and old journals: `/var/log`, `journalctl --disk-usage`, then `sudo journalctl --vacuum-size=500M`.
3. Remove unused container images: `docker image prune` (only dangling images).
4. Clear package and tool caches (apt, pip, browser test caches) if they are large.
5. If nothing can be removed, plan more disk space and tell the service owner.
