# Service Startup

Copy `jalousie.service` into `/lib/systemd/system`.

Adjust `User` and `ExecStart` in `[Service]`.

Link `/lib/systemd/system/jalousie.service` into `/etc/systemd/system/multi-user.target.wants`.

Enable the service `systemctl enable jalousie`.

You can now control the service like:

```bash
service jalousie start
service jalousie restart
service jalousie stop
```
