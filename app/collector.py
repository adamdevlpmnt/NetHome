import asyncio
import time
import psutil
from typing import Dict, Any, Optional
from app.config import BANDWIDTH_POLL_INTERVAL, MONITORED_INTERFACE
from app.database import record_bandwidth_delta

class BandwidthCollector:
    def __init__(self, poll_interval: int = BANDWIDTH_POLL_INTERVAL, interface: str = MONITORED_INTERFACE):
        self.poll_interval = poll_interval
        self.interface = interface
        self._is_running = False
        self._last_sent = 0
        self._last_recv = 0
        self._last_time = 0.0
        
        # Vitesses instantanées en octets/sec
        self.current_upload_speed = 0.0
        self.current_download_speed = 0.0

    def _get_io_counters(self):
        if self.interface and self.interface != "all":
            nics = psutil.net_io_counters(pernic=True)
            if self.interface in nics:
                c = nics[self.interface]
                return c.bytes_sent, c.bytes_recv
        
        # Global par défaut
        c = psutil.net_io_counters(pernic=False)
        return c.bytes_sent, c.bytes_recv

    async def start(self):
        self._is_running = True
        try:
            self._last_sent, self._last_recv = self._get_io_counters()
            self._last_time = time.time()
        except Exception:
            pass

        while self._is_running:
            try:
                await asyncio.sleep(self.poll_interval)
                current_sent, current_recv = self._get_io_counters()
                now = time.time()
                elapsed = max(0.1, now - self._last_time)

                # Gestion du delta et des redémarrages / réinitialisations
                if self._last_sent > 0 and self._last_recv > 0:
                    delta_sent = current_sent - self._last_sent
                    delta_recv = current_recv - self._last_recv

                    # Si les compteurs ont été réinitialisés (reboot de machine)
                    if delta_sent < 0 or delta_recv < 0:
                        delta_sent = 0
                        delta_recv = 0

                    if delta_sent > 0 or delta_recv > 0:
                        record_bandwidth_delta(delta_sent, delta_recv, interface=self.interface or "all")
                    
                    self.current_upload_speed = delta_sent / elapsed
                    self.current_download_speed = delta_recv / elapsed

                self._last_sent = current_sent
                self._last_recv = current_recv
                self._last_time = now

            except asyncio.CancelledError:
                break
            except Exception as e:
                # Log et reprise au cycle suivant
                print(f"[BandwidthCollector Error]: {e}")
                await asyncio.sleep(self.poll_interval)

    def stop(self):
        self._is_running = False

    def get_live_stats(self) -> Dict[str, Any]:
        """Retourne les débits instantanés actuels."""
        return {
            "upload_speed_bps": self.current_upload_speed,
            "download_speed_bps": self.current_download_speed,
            "upload_speed_formatted": self.format_speed(self.current_upload_speed),
            "download_speed_formatted": self.format_speed(self.current_download_speed)
        }

    @staticmethod
    def format_speed(bytes_per_sec: float) -> str:
        bits_per_sec = bytes_per_sec * 8
        if bits_per_sec >= 1_000_000_000:
            return f"{bits_per_sec / 1_000_000_000:.1f} Gbps"
        elif bits_per_sec >= 1_000_000:
            return f"{bits_per_sec / 1_000_000:.1f} Mbps"
        elif bits_per_sec >= 1_000:
            return f"{bits_per_sec / 1_000:.1f} Kbps"
        else:
            return f"{int(bits_per_sec)} bps"

collector_instance = BandwidthCollector()
