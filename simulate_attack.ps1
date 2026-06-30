# =============================================================================
# SIEM Demo — Attack Simulator Script
# =============================================================================
# ใช้สำหรับสร้างการโจมตีจำลองจากเครื่องนี้เข้าหา Honeypot เพื่อทดสอบระบบ
#
# ลำดับการโจมตีตาม MITRE ATT&CK:
#   1. Reconnaissance   (T1595) — Port Scan
#   2. Initial Access   (T1190) — Web Exploit (SQL Injection, XSS, Path Traversal)
#   3. Credential Access(T1110) — SSH Brute Force
#   4. Execution        (T1059) — Command Execution (หลัง SSH login สำเร็จ)
#   5. C&C              (T1071) — Outbound connection ไปยัง IP อันตราย
#
# โครงสร้างที่จำลอง:
#   เครื่องนี้ → proxy.js (port 2222/8080) → Docker Honeypot (port 2223/8081)
#              ↓ (access_layer.log ถูกเขียนทุกครั้ง)
#   SIEM Backend อ่าน Log 3 แหล่ง และส่งผ่าน WebSocket ไปหน้าเว็บ
# =============================================================================

param(
    [string]$Target    = "127.0.0.1",
    [int]   $SshPort   = 2222,
    [int]   $HttpPort  = 8080,
    [switch]$All,
    [switch]$Recon,
    [switch]$WebAttack,
    [switch]$SshBrute,
    [switch]$SlowMode    # เพิ่มหน่วงเวลาให้เห็นบน Dashboard ชัดขึ้น
)

$Delay = if ($SlowMode) { 3 } else { 1 }

function Write-Step($text) {
    Write-Host "`n$(('─' * 60))" -ForegroundColor DarkGray
    Write-Host " $text" -ForegroundColor Cyan
    Write-Host "$(('─' * 60))" -ForegroundColor DarkGray
}

function Write-OK($text)   { Write-Host " [✓] $text" -ForegroundColor Green  }
function Write-Warn($text) { Write-Host " [!] $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host " [✗] $text" -ForegroundColor Red    }
function Write-Info($text) { Write-Host "     $text"  -ForegroundColor Gray   }

# ─── 0. Preflight check ──────────────────────────────────────────────────────
Write-Host @"

  ╔══════════════════════════════════════════════════════════════╗
  ║          KKU SIEM Demo — Attack Simulator v2.0              ║
  ║  Attack flow: This Machine → proxy.js → Docker Honeypot     ║
  ╚══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

Write-Host " Target  : $Target" -ForegroundColor White
Write-Host " SSH Port: $SshPort  (proxy → Cowrie)" -ForegroundColor White
Write-Host " HTTP    : $HttpPort (proxy → WebTrap)" -ForegroundColor White
Write-Host ""

# Verify proxy is reachable
try {
    $null = Test-NetConnection -ComputerName $Target -Port $SshPort -InformationLevel Quiet -ErrorAction Stop
    Write-OK "proxy.js is reachable on :$SshPort"
} catch {
    Write-Warn "proxy.js might not be running. Start it with: node proxy.js"
}

if (-not ($All -or $Recon -or $WebAttack -or $SshBrute)) { $All = $true }

# ─── 1. Reconnaissance — Port Scan (T1595) ───────────────────────────────────
if ($All -or $Recon) {
    Write-Step "PHASE 1: Reconnaissance — Port Scan (MITRE T1595)"
    Write-Info "Simulating: Attacker scans for open ports on the target"
    Write-Info "Expected  : access_layer.log ← PORT_SCAN_DETECTED"

    $ports = @($SshPort, $HttpPort, 3389, 445, 8443, 21, 23, 3306, 5432, 6379)
    foreach ($p in $ports) {
        Write-Info "  → Scanning port $p..."
        try {
            $tc = New-Object System.Net.Sockets.TcpClient
            $async = $tc.BeginConnect($Target, $p, $null, $null)
            $wait  = $async.AsyncWaitHandle.WaitOne(500, $false)
            if ($wait) { Write-OK "  Port $p  — OPEN" } else { Write-Info "  Port $p  — closed" }
            $tc.Close()
        } catch { Write-Info "  Port $p  — filtered" }
        Start-Sleep -Milliseconds 200
    }
    Write-OK "Recon phase complete — check access_layer.log for PORT_SCAN_DETECTED"
    Start-Sleep -Seconds $Delay
}

# ─── 2. Initial Access — Web Exploit (T1190) ─────────────────────────────────
if ($All -or $WebAttack) {
    Write-Step "PHASE 2: Initial Access — Web Exploit (MITRE T1190)"
    Write-Info "Simulating: Attacker sends malicious HTTP requests to WebTrap"
    Write-Info "Expected  : webtrap.json ← SQL Inject / XSS / Path Traversal"

    $baseUrl = "http://${Target}:${HttpPort}"
    $attacks = @(
        @{ url = "$baseUrl/?id=1'+OR+1%3D1--"; label = "SQL Injection (Classic)" },
        @{ url = "$baseUrl/?id=1+UNION+SELECT+username,password+FROM+users--"; label = "SQL Injection (UNION)" },
        @{ url = "$baseUrl/?search=<script>alert('XSS')</script>"; label = "XSS Attempt" },
        @{ url = "$baseUrl/../../../../etc/passwd"; label = "Path Traversal" },
        @{ url = "$baseUrl/admin"; label = "Web Scan (admin panel)" },
        @{ url = "$baseUrl/.env"; label = "Web Scan (.env file)" },
        @{ url = "$baseUrl/wp-admin"; label = "Web Scan (WordPress)" }
    )

    foreach ($atk in $attacks) {
        Write-Info "  → $($atk.label)"
        try {
            $resp = Invoke-WebRequest -Uri $atk.url -UseBasicParsing `
                        -Headers @{ "User-Agent" = "nikto/2.1.6 (Evasion Test)" } `
                        -TimeoutSec 5 -ErrorAction SilentlyContinue
            Write-OK "    $($resp.StatusCode) — Logged by WebTrap"
        } catch {
            Write-Warn "    Connection failed (WebTrap might not be running)"
        }
        Start-Sleep -Milliseconds 500
    }
    Write-OK "Web attack phase complete — check webtrap.json"
    Start-Sleep -Seconds $Delay
}

# ─── 3. Credential Access — SSH Brute Force (T1110) ──────────────────────────
if ($All -or $SshBrute) {
    Write-Step "PHASE 3: Credential Access — SSH Brute Force (MITRE T1110)"
    Write-Info "Simulating: Attacker brute-forces SSH credentials"
    Write-Info "Expected  : cowrie.json ← login.failed (x many) then login.success"

    # Check if ssh client exists
    $sshOk = $null -ne (Get-Command ssh -ErrorAction SilentlyContinue)
    if (-not $sshOk) {
        Write-Warn "ssh client not found — using TCP connect simulation instead"
    }

    $credentials = @(
        @{ user = "root";  pass = "root"     },
        @{ user = "admin"; pass = "admin"    },
        @{ user = "root";  pass = "123456"   },
        @{ user = "admin"; pass = "password" },
        @{ user = "root";  pass = "toor"     },
        @{ user = "user";  pass = "user"     },
        @{ user = "root";  pass = "raspberry"},
        @{ user = "pi";    pass = "raspberry"}
    )

    foreach ($cred in $credentials) {
        Write-Info "  → Trying $($cred.user):$($cred.pass)"
        if ($sshOk) {
            # Real SSH attempt (will fail/succeed on Cowrie)
            $sshArgs = @(
                "-o", "StrictHostKeyChecking=no",
                "-o", "ConnectTimeout=3",
                "-o", "BatchMode=yes",
                "-p", $SshPort,
                "$($cred.user)@$Target"
            )
            $proc = Start-Process ssh -ArgumentList $sshArgs -PassThru -WindowStyle Hidden
            Start-Sleep -Seconds 2
            if (-not $proc.HasExited) { $proc.Kill() }
        } else {
            # TCP touch simulation (triggers access_layer.log)
            try {
                $tc = New-Object System.Net.Sockets.TcpClient
                $tc.Connect($Target, $SshPort)
                Start-Sleep -Milliseconds 300
                $tc.Close()
                Write-OK "    TCP connect to :$SshPort (Cowrie will log)"
            } catch { Write-Warn "    Could not connect to :$SshPort" }
        }
        Start-Sleep -Milliseconds 800
    }
    Write-OK "SSH brute force phase complete — check cowrie.json for login events"
    Start-Sleep -Seconds $Delay
}

# ─── Summary ─────────────────────────────────────────────────────────────────
Write-Host @"

  ╔══════════════════════════════════════════════════════════════╗
  ║                    Attack Simulation Done!                   ║
  ╠══════════════════════════════════════════════════════════════╣
  ║  Expected Log Files:                                         ║
  ║    .\siem-logs\access_layer.log  ← Core Switch NetFlow      ║
  ║    .\siem-logs\cnc_outbound.log  ← Firewall Outbound        ║
  ║    .\cowrie-config\var\log\cowrie\cowrie.json ← SSH Honeypot ║
  ║    .\webtrap-logs\webtrap.json   ← Web Honeypot             ║
  ╠══════════════════════════════════════════════════════════════╣
  ║  SIEM Dashboard: http://localhost:3000/dashboard             ║
  ╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta
