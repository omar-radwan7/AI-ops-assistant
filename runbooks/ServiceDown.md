# Runbook: Service down
1. Check if the process or container is running: `docker ps -a` or `systemctl status <service>`.
2. Read the last log lines: `docker logs --tail 100 <container>` or `journalctl -u <service> -n 100`.
3. Restart the service once. If it stops again, do not loop restarts: escalate to the owner.
4. Check dependencies: database, disk space, network, expired certificates.
