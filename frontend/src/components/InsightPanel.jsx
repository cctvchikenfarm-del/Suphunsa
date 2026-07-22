import React from 'react'
import { AlertTriangle, Lightbulb, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { formatNumber } from '../api.js'

function TrendIcon({ direction }) {
  if (direction === 'up') return <TrendingUp size={18} />
  if (direction === 'down') return <TrendingDown size={18} />
  return <Sparkles size={18} />
}

export default function InsightPanel({ insights, compact = false }) {
  if (!insights) {
    return (
      <div className="card insight-card soft">
        <div className="insight-heading">
          <div className="insight-icon"><Sparkles size={20} /></div>
          <div>
            <h3>AI Insight</h3>
            <p className="muted">รอข้อมูลจากระบบวิเคราะห์</p>
          </div>
        </div>
      </div>
    )
  }

  const mainTrends = (insights.trends || [])
    .filter(item => Number(item.current_value ?? item.current_weight_kg ?? 0) > 0 || Number(item.previous_value ?? item.previous_weight_kg ?? 0) > 0)
    .sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
    .slice(0, compact ? 2 : 4)

  const recommendations = (insights.recommendations || []).slice(0, compact ? 2 : 4)
  const anomalies = (insights.anomalies || []).slice(0, compact ? 2 : 5)

  return (
    <div className="card insight-card">
      <div className="insight-heading">
        <div className="insight-icon"><Sparkles size={20} /></div>
        <div>
          <p className="eyebrow mini">AI Insight</p>
          <h3>วิเคราะห์แนวโน้มและข้อเสนอแนะ</h3>
          <p className="muted">{insights.headline}</p>
          <p className="muted" style={{fontSize:'11px'}}>{insights.engine}{insights.ai?.status==='fallback'?' · AI ภายนอกไม่พร้อม ใช้ผลคำนวณภายใน':insights.ai?.status==='explained'?' · AI อธิบายจากยอดสรุปแล้ว':' · วิเคราะห์ตัวเลขภายใน'}</p>
        </div>
        <div className="insight-score">
          <span>Ready Score</span>
          <strong>{formatNumber(insights.score || 0, 0)}%</strong>
        </div>
      </div>

      <div className={`insight-grid ${compact ? 'compact' : ''}`}>
        <div className="insight-section">
          <div className="section-kicker"><TrendingUp size={16} /> แนวโน้มเด่น</div>
          <div className="insight-list">
            {mainTrends.map(item => (
              <div key={item.module} className={`insight-row ${item.direction}`}>
                <TrendIcon direction={item.direction} />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.message} · เดือนนี้ {formatNumber(item.current_value ?? item.current_weight_kg)} {item.unit || 'kg'}</span>
                </div>
              </div>
            ))}
            {!mainTrends.length && <p className="muted no-margin">ยังไม่มีข้อมูลเพียงพอสำหรับดูแนวโน้ม</p>}
          </div>
        </div>

        <div className="insight-section">
          <div className="section-kicker"><AlertTriangle size={16} /> จุดที่ควรตรวจ</div>
          <div className="insight-list">
            {anomalies.map((item, idx) => (
              <div key={`${item.module}-${idx}`} className={`insight-row severity-${item.severity}`}>
                <AlertTriangle size={18} />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.label}{item.date ? ` · ${item.date}` : ''} · {item.details}</span>
                </div>
              </div>
            ))}
            {!anomalies.length && <p className="muted no-margin">ไม่พบความผิดปกติสำคัญในเดือนนี้</p>}
          </div>
        </div>

        <div className="insight-section recommendations">
          <div className="section-kicker"><Lightbulb size={16} /> ข้อเสนอแนะ</div>
          <div className="recommendation-list">
            {recommendations.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className={`recommendation ${item.priority}`}>
                <strong>{item.title}</strong>
                <span>{item.details}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
