# Alternative free host: Oracle Cloud Always Free VM

Use this if you'd rather not run the worker on GitHub Actions. Oracle's
Always Free tier gives a small ARM VM (up to 4 OCPU / 24 GB) at $0 forever;
a card is required for identity verification but is never charged on the
Always Free shapes.

1. Sign up at https://www.oracle.com/cloud/free/ and create a
   **VM.Standard.A1.Flex** instance (Ubuntu 22.04, 1 OCPU / 6 GB is plenty).
2. SSH in and install Node 20:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   ```
3. Clone and configure:
   ```bash
   git clone https://github.com/abpsops/BUNKERWATCH.git
   cd BUNKERWATCH/worker && npm ci
   cp .env.example .env && nano .env   # AISSTREAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   ```
4. Run it as a service that restarts on crash and reboot:
   ```bash
   sudo tee /etc/systemd/system/bunkerwatch-ais.service >/dev/null <<'UNIT'
   [Unit]
   Description=BunkerWatch AIS worker
   After=network-online.target
   [Service]
   WorkingDirectory=/home/ubuntu/BUNKERWATCH/worker
   ExecStart=/usr/bin/npm start
   Restart=always
   RestartSec=5
   User=ubuntu
   [Install]
   WantedBy=multi-user.target
   UNIT
   sudo systemctl enable --now bunkerwatch-ais
   journalctl -u bunkerwatch-ais -f     # expect "[positions] upserted N vessels" every ~5 s
   ```
5. Disable `.github/workflows/ais-live.yml` (Actions tab → workflow → ⋯ → Disable)
   so only one process holds the AISStream connection.
