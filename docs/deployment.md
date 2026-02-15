# Deployment

The API runs in the foreground by default. To keep it running in the background:

## nohup

```bash
# Option 1: nohup
nohup motherbrain api start &

# Option 2: redirect logs
motherbrain api start > /tmp/motherbrain-api.log 2>&1 &

# Check if it's running
curl http://127.0.0.1:7337/health
```

## macOS (launchd)

```bash
cat > ~/Library/LaunchAgents/com.motherbrain.api.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.motherbrain.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/motherbrain</string>
    <string>api</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USER/your-project</string>
  <key>StandardOutPath</key>
  <string>/tmp/motherbrain-api.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/motherbrain-api.log</string>
</dict>
</plist>
EOF

# Enable
launchctl load ~/Library/LaunchAgents/com.motherbrain.api.plist

# Disable
launchctl unload ~/Library/LaunchAgents/com.motherbrain.api.plist
```

## Linux (systemd)

```bash
sudo tee /etc/systemd/system/motherbrain-api.service << 'EOF'
[Unit]
Description=Mother Brain API
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/motherbrain api start
WorkingDirectory=/home/YOUR_USER/your-project
Restart=on-failure
RestartSec=5
User=YOUR_USER

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable motherbrain-api
sudo systemctl start motherbrain-api

# Check status / logs
sudo systemctl status motherbrain-api
journalctl -u motherbrain-api -f
```
