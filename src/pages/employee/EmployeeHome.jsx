// ============================================================
// TELEMETRYDOCK.JSX — Dock trạng thái thiết bị + live clock
// ============================================================
// 🔧 FIX #69: clock dùng Intl.DateTimeFormat cố định (24h, VN timezone)
// 🔧 V8: Nhận prop `devices` để hiển thị trạng thái thật
// ============================================================

import { useEffect, useState } from "react";
import { Server } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";

const DEFAULT_DEVICES = [
  { name: "POS Online", status: "online" },
  { name: "KDS Quầy 1: Kết nối tốt", status: "online" },
  { name: "KDS Quầy 2: Kết nối tốt", status: "online" },
  { name: "Máy in bill quẹt mã: Sẵn sàng giấy in", status: "online" },
];

const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export default function TelemetryDock({ devices = DEFAULT_DEVICES }) {
  const { t } = useI18n();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clockStr = TIME_FORMATTER.format(now);

  return (
    <div className="telemetry-dock">
      <div className="telemetry-dock__devices">
        <div className="telemetry-dock__label">
          <Server size={18} style={{ color: "var(--st-success)" }} />
          <span>{t("Hệ thống Trạm:")}</span>
        </div>
        {devices.map((d, i) => (
          <div key={i} className="telemetry-dock__device">
            <span
              className={`telemetry-dock__dot ${
                d.status !== "online" ? `telemetry-dock__dot--${d.status}` : ""
              }`}
            />
            <span>{d.name}</span>
          </div>
        ))}
      </div>

      <div className="telemetry-dock__clock">
        <span className="telemetry-dock__clock-label">
          {t("Đồng bộ máy chủ cơ sở Hà Nội")}
        </span>
        <span className="telemetry-dock__clock-value">{clockStr}</span>
      </div>
    </div>
  );
}