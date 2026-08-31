import React, { useState, useEffect } from 'react';
import { 
  db, 
  toJsDate, 
  collection, 
  getDocs 
} from '../firebase';
import { CheckIn, MealForecastItem } from '../types';
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
  Utensils 
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
}

export const Analytics: React.FC<AnalyticsProps> = ({ hotelId }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => businessMonth());
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [hourlyTraffic, setHourlyTraffic] = useState<{ hour: string; count: number }[]>([]);

  useEffect(() => {
    fetchData();
  }, [hotelId, selectedMonth]);

  const fetchData = async () => {
    try {
      const stats: DailyStats[] = [];
      const trafficMap: Record<string, number> = {};

      for (let hour = 6; hour <= 21; hour++) {
        trafficMap[`${hour.toString().padStart(2, '0')}:00`] = 0;
      }

      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const today = businessDate();

      // Fetch all forecasts for this month
      const forecastRef = collection(db, 'hotels', hotelId, 'forecasts');
      const forecastSnap = await getDocs(forecastRef);
      const forecastMap: Record<string, number> = {};
      forecastSnap.docs.forEach((d) => {
        const data = d.data() as MealForecastItem;
        forecastMap[data.date] = data.totalCovers || 0;
      });

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
        if (dateStr > today) continue;

        let bActual = 0, lActual = 0, dActual = 0;
        let roomsAttended = 0;

        const checkinsRef = collection(db, 'hotels', hotelId, 'checkins', dateStr, 'rooms');
        const checkinsSnap = await getDocs(checkinsRef);

        checkinsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as CheckIn;
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

        stats.push({
          date: dateStr,
          breakfastActual: bActual,
          lunchActual: lActual,
          dinnerActual: dActual,
          totalActual: bActual + lActual + dActual,
          forecastCovers: forecastMap[dateStr] || 50,
          roomsAttended,
        });
      }

      setDailyStats(stats);
      setHourlyTraffic(
        Object.entries(trafficMap)
          .map(([hour, count]) => ({ hour, count }))
          .filter((h) => {
            const hourNum = parseInt(h.hour.split(':')[0], 10);
            return (hourNum >= 6 && hourNum <= 11) || (hourNum >= 18 && hourNum <= 22);
          })
      );
    } catch (err) {
      console.warn('Analytics fetch error:', err);
    }
  };

  const totalBreakfastMonth = dailyStats.reduce((acc, d) => acc + d.breakfastActual, 0);
  const totalDinnerMonth = dailyStats.reduce((acc, d) => acc + d.dinnerActual, 0);
  const totalCoversMonth = dailyStats.reduce((acc, d) => acc + d.totalActual, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">Management Analytics</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground">F&B Performance</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
              {hotelId === 'ibis' ? "ibis Delhi Street & Charlie's Corner Analytics" : 'Novotel Food Exchange Analytics'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Attendance patterns, service peak traffic, and forecast capture rates.
            </p>
          </div>

          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 rounded-xl border border-border bg-white text-foreground text-xs font-mono-custom focus:outline-none focus:border-accent shadow-xs"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <span className="label-mono text-indigo-700">Dinner Covers</span>
            <Moon size={16} className="text-indigo-600" />
          </div>
          <p className="text-3xl font-bold font-display text-indigo-800 mt-2">{totalDinnerMonth}</p>
          <p className="text-xs font-mono-custom text-muted-foreground mt-1">Evening service attendance</p>
        </div>
      </div>

      {/* Hourly Flow Chart */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-luxury">
        <div className="mb-6">
          <h3 className="text-base font-bold font-display text-foreground">Service Traffic Peak Flow</h3>
          <p className="text-xs text-muted-foreground">Covers distribution by hour of day (Bangkok UTC+7)</p>
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
    </div>
  );
};
