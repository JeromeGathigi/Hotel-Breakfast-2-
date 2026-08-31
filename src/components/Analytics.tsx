import React, { useState, useEffect } from 'react';
import { 
  db, 
  toJsDate, 
  collection, 
  getDocs 
} from '../firebase';
import { CheckIn, MealForecastItem, DailySummary } from '../types';
import { StatsCardSkeleton, ChartSkeleton } from './Skeleton';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Coffee, 
  Moon, 
  Utensils,
  Award,
  Calendar,
  Clock,
  AlertTriangle,
  FlaskConical
} from 'lucide-react';
import { bangkokHour, businessDate, businessMonth } from '../lib/businessDate';

interface AnalyticsProps {
  hotelId: string;
}

interface DailyStats {
  date: string;
  breakfastActual: number;
  lunchActual: number;
  dinnerActual: number;
  totalActual: number;
  forecastCovers: number;
  roomsAttended: number;
  captureRate: number;
  vipPax: number;
  peakHour?: string;
}

export const Analytics: React.FC<AnalyticsProps> = ({ hotelId }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => businessMonth());
  const [includeDemoData, setIncludeDemoData] = useState<boolean>(false);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [hourlyTraffic, setHourlyTraffic] = useState<{ hour: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [hotelId, selectedMonth, includeDemoData]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const stats: DailyStats[] = [];
      const trafficMap: Record<string, number> = {};

      for (let hour = 6; hour <= 21; hour++) {
        trafficMap[`${hour.toString().padStart(2, '0')}:00`] = 0;
      }

      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const today = businessDate();

      // 1. Fetch pre-aggregated daily summaries for this hotel
      const summariesRef = collection(db, 'hotels', hotelId, 'daily_summaries');
      const summariesSnap = await getDocs(summariesRef);
      const summariesMap: Record<string, DailySummary> = {};
      summariesSnap.docs.forEach((d) => {
        const data = d.data() as DailySummary;
        // If not including demo data, skip synthetic docs
        if (!includeDemoData && (data.isSynthetic || data.syntheticSource === 'historicalSeeder')) {
          return;
        }
        if (data.date.startsWith(selectedMonth)) {
          summariesMap[data.date] = data;
        }
      });

      // 2. Fetch forecasts for this month
      const forecastRef = collection(db, 'hotels', hotelId, 'forecasts');
      const forecastSnap = await getDocs(forecastRef);
      const forecastMap: Record<string, number> = {};
      forecastSnap.docs.forEach((d) => {
        const data = d.data() as MealForecastItem;
        if (!includeDemoData && (data.isSynthetic || data.syntheticSource === 'historicalSeeder')) {
          return;
        }
        forecastMap[data.date] = data.totalCovers || 0;
      });

      // 3. For each day in the month, use summary or calculate from checkins
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
        if (dateStr > today) continue;

        if (summariesMap[dateStr]) {
          const sum = summariesMap[dateStr];
          stats.push({
            date: dateStr,
            breakfastActual: sum.totalBreakfastPax,
            lunchActual: sum.totalLunchPax || 0,
            dinnerActual: sum.totalDinnerPax || 0,
            totalActual: sum.totalCovers,
            forecastCovers: sum.forecastCovers || forecastMap[dateStr] || 60,
            roomsAttended: sum.roomsAttended || 0,
            captureRate: sum.captureRatePercent || Math.round((sum.totalBreakfastPax / (sum.forecastCovers || 60)) * 100),
            vipPax: sum.vipPax || 0,
            peakHour: sum.peakHour,
          });

          // Aggregate hourly traffic
          if (sum.hourlyBreakdown) {
            Object.entries(sum.hourlyBreakdown).forEach(([h, count]) => {
              if (trafficMap[h] !== undefined) {
                trafficMap[h] += count;
              }
            });
          }
        } else {
          // Fallback to raw checkins collection
          let bActual = 0, lActual = 0, dActual = 0;
          let roomsAttended = 0;

          const checkinsRef = collection(db, 'hotels', hotelId, 'checkins', dateStr, 'rooms');
          const checkinsSnap = await getDocs(checkinsRef);

          checkinsSnap.docs.forEach((docSnap) => {
            const data = docSnap.data() as CheckIn;
            if (!includeDemoData && (data.isSynthetic || data.syntheticSource === 'historicalSeeder')) {
              return;
            }
            const totalPax = (Number(data.adultsAte) || 0) + (Number(data.childrenAte) || 0) + (Number(data.infantsAte) || 0);

            if (data.mealService === 'dinner') {
              dActual += totalPax;
            } else if (data.mealService === 'lunch') {
              lActual += totalPax;
            } else {
              bActual += totalPax;
            }

            roomsAttended += 1;

            if (data.timestamp) {
              const jsDate = toJsDate(data.timestamp);
              if (jsDate) {
                const bangkok = bangkokHour(jsDate);
                const hourStr = `${bangkok.toString().padStart(2, '0')}:00`;
                if (trafficMap[hourStr] !== undefined) {
                  trafficMap[hourStr] += totalPax;
                }
              }
            }
          });

          const fCovers = forecastMap[dateStr] || 50;
          stats.push({
            date: dateStr,
            breakfastActual: bActual,
            lunchActual: lActual,
            dinnerActual: dActual,
            totalActual: bActual + lActual + dActual,
            forecastCovers: fCovers,
            roomsAttended,
            captureRate: fCovers > 0 ? Math.round((bActual / fCovers) * 100) : 0,
            vipPax: 0,
          });
        }
      }

      setDailyStats(stats);
      setHourlyTraffic(
        Object.entries(trafficMap)
          .map(([hour, count]) => ({ hour, count }))
          .filter((h) => {
            const hourNum = parseInt(h.hour.split(':')[0], 10);
            return (hourNum >= 6 && hourNum <= 12) || (hourNum >= 18 && hourNum <= 22);
          })
      );
    } catch (err) {
      console.warn('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalBreakfastMonth = dailyStats.reduce((acc, d) => acc + d.breakfastActual, 0);
  const totalDinnerMonth = dailyStats.reduce((acc, d) => acc + d.dinnerActual, 0);
  const totalCoversMonth = dailyStats.reduce((acc, d) => acc + d.totalActual, 0);
  const totalVipMonth = dailyStats.reduce((acc, d) => acc + d.vipPax, 0);
  const avgCaptureRate = dailyStats.length > 0 
    ? Math.round(dailyStats.reduce((acc, d) => acc + (d.captureRate || 0), 0) / dailyStats.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">Management Analytics</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground">Historical & Real-Time Performance</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
              {hotelId === 'ibis' ? "ibis Delhi Street & Charlie's Corner Analytics" : 'Novotel Food Exchange Analytics'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Attendance patterns, service peak traffic, forecast capture rates, and historical rollups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Demo Data Toggle */}
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-[#F2EBE4]/40 hover:bg-[#F2EBE4] cursor-pointer transition-all text-xs font-mono-custom">
              <input
                type="checkbox"
                checked={includeDemoData}
                onChange={(e) => setIncludeDemoData(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <FlaskConical size={13} className={includeDemoData ? 'text-amber-600' : 'text-muted-foreground'} />
                <span>Include demo data</span>
              </span>
            </label>

            <div className="flex items-center gap-1 bg-[#F2EBE4]/60 p-1 rounded-xl border border-border">
              {['2023', '2024', '2025', '2026'].map((yr) => {
                const isSelected = selectedMonth.startsWith(yr);
                const currentMonthNum = selectedMonth.split('-')[1] || '01';
                return (
                  <button
                    key={yr}
                    onClick={() => setSelectedMonth(`${yr}-${currentMonthNum}`)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-black text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[#F2EBE4]'
                    }`}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>

            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom focus:outline-none focus:border-accent shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* Synthetic Demo Data Warning Banner */}
      {includeDemoData && (
        <div className="bg-amber-50 border border-amber-300/80 text-amber-900 rounded-2xl p-4 flex items-center gap-3 shadow-xs">
          <AlertTriangle size={20} className="text-amber-600 shrink-0" />
          <div className="text-xs">
            <p className="font-bold font-mono-custom text-amber-950">
              Showing synthetic demo data
            </p>
            <p className="text-amber-800 mt-0.5">
              Attendance and revenue figures include randomly generated historical projections. Toggle off to view verified real-world Opera data only.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <StatsCardSkeleton key={idx} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="stat-card-luxury">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="label-mono">Month Total Covers</span>
              <Utensils size={16} className="text-accent" />
            </div>
            <p className="text-3xl font-bold font-display text-foreground mt-2">{totalCoversMonth}</p>
            <p className="text-xs font-mono-custom text-muted-foreground mt-1">Total guests served</p>
          </div>

          <div className="stat-card-luxury">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="label-mono text-accent">Breakfast Covers</span>
              <Coffee size={16} className="text-accent" />
            </div>
            <p className="text-3xl font-bold font-display text-accent mt-2">{totalBreakfastMonth}</p>
            <p className="text-xs font-mono-custom text-muted-foreground mt-1">Morning buffet attendance</p>
          </div>

          <div className="stat-card-luxury">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="label-mono text-emerald-700">Avg Capture Rate</span>
              <span className="text-xs font-mono-custom font-bold text-emerald-600">Actual vs Fcst</span>
            </div>
            <p className="text-3xl font-bold font-display text-emerald-800 mt-2">{avgCaptureRate}%</p>
            <p className="text-xs font-mono-custom text-muted-foreground mt-1">Meal plan entitlement capture</p>
          </div>

          <div className="stat-card-luxury">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="label-mono text-amber-700">VIP Recognition</span>
              <Award size={16} className="text-amber-600" />
            </div>
            <p className="text-3xl font-bold font-display text-amber-800 mt-2">{totalVipMonth}</p>
            <p className="text-xs font-mono-custom text-muted-foreground mt-1">ALL Diamond/Platinum guests</p>
          </div>
        </div>
      )}

      {/* Hourly Flow Chart */}
      {loading ? (
        <ChartSkeleton height="h-72" />
      ) : (
        <div className="bg-white border border-border rounded-2xl p-6 shadow-luxury">
          <div className="mb-6">
            <h3 className="text-base font-bold font-display text-foreground">Service Traffic Peak Flow</h3>
            <p className="text-xs text-muted-foreground">Covers distribution by hour of day (Bangkok UTC+7) — Weekend service extends to 12:00 PM</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyTraffic}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(10, 22, 43, 0.06)" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#0A162B' }} fontFamily="Claimcheck, Numbers-Claimcheck, Chivo Mono, monospace" />
                <YAxis tick={{ fontSize: 11, fill: '#0A162B' }} fontFamily="Claimcheck, Numbers-Claimcheck, Chivo Mono, monospace" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFFFFF', 
                    borderColor: 'rgba(10, 22, 43, 0.12)',
                    borderRadius: '12px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                    fontFamily: 'Rokkitt, serif'
                  }} 
                />
                <Bar dataKey="count" name="Seated Guests" fill="#1A3A6D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Day-by-Day Historical Performance Breakdown */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-luxury space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold font-display text-foreground">
              Daily Attendance & Capture Performance ({selectedMonth})
            </h3>
            <p className="text-xs text-muted-foreground">
              Day-by-day actual covers, forecast variance, and peak breakfast rush hours.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-[#F2EBE4]/60 border-b border-border text-[10px] font-mono-custom font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Forecast</th>
                <th className="px-4 py-3">Breakfast Actual</th>
                <th className="px-4 py-3">Dinner Actual</th>
                <th className="px-4 py-3">Total Pax</th>
                <th className="px-4 py-3">Capture Rate</th>
                <th className="px-4 py-3">VIPs</th>
                <th className="px-4 py-3">Peak Hour</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs font-mono-custom text-muted-foreground">
                    Loading monthly historical breakdown...
                  </td>
                </tr>
              ) : dailyStats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs font-mono-custom text-muted-foreground">
                    No historical logs for this month yet. Use the <strong>Opera Sync & Historical Hub</strong> to backfill past data.
                  </td>
                </tr>
              ) : (
                dailyStats.map((d) => (
                  <tr key={d.date} className="hover:bg-[#F2EBE4]/30 transition-colors">
                    <td className="px-4 py-3 font-mono-custom font-bold text-foreground">
                      {d.date}
                    </td>
                    <td className="px-4 py-3 font-mono-custom text-muted-foreground">
                      {d.forecastCovers}
                    </td>
                    <td className="px-4 py-3 font-mono-custom font-bold text-accent">
                      {d.breakfastActual}
                    </td>
                    <td className="px-4 py-3 font-mono-custom text-indigo-700">
                      {d.dinnerActual}
                    </td>
                    <td className="px-4 py-3 font-mono-custom font-bold text-foreground">
                      {d.totalActual}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-bold ${
                        d.captureRate >= 90
                          ? 'bg-emerald-100 text-emerald-800'
                          : d.captureRate >= 75
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {d.captureRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono-custom text-foreground">
                      {d.vipPax > 0 ? `${d.vipPax} Pax` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono-custom font-bold text-foreground">
                      {d.peakHour || '08:00'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

