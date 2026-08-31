import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc 
} from '../firebase';
import { MealForecastItem } from '../types';
import { SAMPLE_NOVOTEL_FORECAST, SAMPLE_IBIS_FORECAST } from '../parsing/__fixtures__/sampleData';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  Coffee, 
  Moon, 
  Utensils 
} from 'lucide-react';

interface ForecastViewProps {
  hotelId: string;
  isAdmin: boolean;
}

export const ForecastView: React.FC<ForecastViewProps> = ({ hotelId }) => {
  const [forecasts, setForecasts] = useState<MealForecastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7days' | '14days' | 'all'>('7days');
  const [selectedDay, setSelectedDay] = useState<MealForecastItem | null>(null);

  useEffect(() => {
    setLoading(true);
    const forecastRef = collection(db, 'hotels', hotelId, 'forecasts');
    const unsub = onSnapshot(
      forecastRef,
      (snap) => {
        if (snap.empty) {
          const sample = hotelId === 'ibis' ? SAMPLE_IBIS_FORECAST : SAMPLE_NOVOTEL_FORECAST;
          sample.forEach((item) => {
            setDoc(doc(db, 'hotels', hotelId, 'forecasts', item.date), item);
          });
          setForecasts(sample);
          if (sample.length > 0) setSelectedDay(sample[0]);
        } else {
          const list = snap.docs.map((d) => d.data() as MealForecastItem);
          list.sort((a, b) => a.date.localeCompare(b.date));
          setForecasts(list);
          if (list.length > 0 && !selectedDay) setSelectedDay(list[0]);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Forecast listener notice:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [hotelId]);

  const displayedForecasts = forecasts.slice(0, dateRange === '7days' ? 7 : dateRange === '14days' ? 14 : undefined);

  // Aggregate totals
  const totalBreakfastCovers = displayedForecasts.reduce((acc, f) => acc + (f.totalBreakfast || 0), 0);
  const totalDinnerCovers = displayedForecasts.reduce((acc, f) => acc + (f.totalDinner || 0), 0);
  const totalAllCovers = displayedForecasts.reduce((acc, f) => acc + (f.totalCovers || 0), 0);
  const avgDailyCovers = displayedForecasts.length > 0 ? Math.round(totalAllCovers / displayedForecasts.length) : 0;

  // Chart data formatting
  const chartData = displayedForecasts.map((f) => {
    const d = new Date(f.date);
    const dayLabel = `${f.dayOfWeek || ''} ${d.getDate()}/${d.getMonth() + 1}`;
    return {
      name: dayLabel,
      date: f.date,
      breakfast: f.totalBreakfast || 0,
      dinner: f.totalDinner || 0,
      breaks: f.totalBreaks || 0,
      total: f.totalCovers || 0,
      occupancy: f.roomsOccupied || 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white rounded-2xl p-6 border border-border shadow-luxury">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-accent">Opera PMS Analytics</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="font-mono-custom text-xs font-semibold text-muted-foreground">Meal Packages Breakdown</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-foreground mt-1 tracking-tight">
              {hotelId === 'ibis' ? "ibis Chiang Mai (Delhi Street) Covers Forecast" : 'Novotel Chiang Mai (Food Exchange) Covers Forecast'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Multi-meal package projections, room occupancy ratios, and daily F&B cover targets.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-[#F2EBE4]/80 border border-border rounded-xl p-1 flex items-center">
              <button
                onClick={() => setDateRange('7days')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                  dateRange === '7days' ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10' : 'text-black hover:text-black hover:bg-white/60'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setDateRange('14days')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                  dateRange === '14days' ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10' : 'text-black hover:text-black hover:bg-white/60'
                }`}
              >
                14 Days
              </button>
              <button
                onClick={() => setDateRange('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono-custom font-bold transition-all cursor-pointer ${
                  dateRange === 'all' ? 'bg-white text-black shadow-xs border border-black/20 ring-1 ring-black/10' : 'text-black hover:text-black hover:bg-white/60'
                }`}
              >
                Full Month
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card-luxury">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="label-mono">Total Projected Covers</span>
            <Utensils size={16} className="text-accent" />
          </div>
          <p className="text-3xl font-bold font-display text-foreground mt-2">{totalAllCovers}</p>
          <p className="text-xs font-mono-custom text-muted-foreground mt-1">Over {displayedForecasts.length} days</p>
        </div>

        <div className="stat-card-luxury">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="label-mono text-accent">Breakfast Covers (BF)</span>
            <Coffee size={16} className="text-accent" />
          </div>
          <p className="text-3xl font-bold font-display text-accent mt-2">{totalBreakfastCovers}</p>
          <p className="text-xs font-mono-custom text-muted-foreground mt-1">
            {displayedForecasts.length > 0 ? Math.round(totalBreakfastCovers / displayedForecasts.length) : 0} avg / day
          </p>
        </div>

        <div className="stat-card-luxury">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="label-mono text-indigo-700">Dinner Covers (DIN)</span>
            <Moon size={16} className="text-indigo-600" />
          </div>
          <p className="text-3xl font-bold font-display text-indigo-800 mt-2">{totalDinnerCovers}</p>
          <p className="text-xs font-mono-custom text-muted-foreground mt-1">Half-board & Package dinners</p>
        </div>

        <div className="stat-card-luxury">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="label-mono text-emerald-700">Daily Average Demand</span>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <p className="text-3xl font-bold font-display text-emerald-800 mt-2">{avgDailyCovers}</p>
          <p className="text-xs font-mono-custom text-muted-foreground mt-1">F&B seating capacity guidance</p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-luxury">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold font-display text-foreground">Projected Meal Covers</h3>
            <p className="text-xs text-muted-foreground">Daily distribution of breakfast and dinner packages</p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(10, 22, 43, 0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#0A162B' }} fontFamily="Claimcheck, Numbers-Claimcheck, Chivo Mono, monospace" />
              <YAxis tick={{ fontSize: 11, fill: '#0A162B' }} fontFamily="Claimcheck, Numbers-Claimcheck, Chivo Mono, monospace" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFFFF', 
                  borderColor: 'rgba(10, 22, 43, 0.12)',
                  borderRadius: '12px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
                  fontSize: '12px',
                  color: '#0A162B',
                  fontFamily: 'Rokkitt, serif'
                }} 
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '12px', fontFamily: 'Claimcheck, Numbers-Claimcheck, Chivo Mono, monospace' }} />
              <Bar dataKey="breakfast" name="Breakfast Covers" fill="#1A3A6D" radius={[6, 6, 0, 0]} />
              <Bar dataKey="dinner" name="Dinner Covers" fill="#6366f1" radius={[6, 6, 0, 0]} />
              <Bar dataKey="breaks" name="Coffee Breaks" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Day by Day Forecast Table */}
      <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-luxury">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold font-display text-foreground">Daily Package Breakdown Schedule</h3>
            <p className="text-xs text-muted-foreground">Detailed counts by Opera product code (BF, BF350NET, CNFBB, DINNER)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F2EBE4]/60 border-b border-border label-mono">
              <tr>
                <th className="p-3.5">Stay Date</th>
                <th className="p-3.5">Day</th>
                <th className="p-3.5">Occupied</th>
                <th className="p-3.5 text-accent font-bold">Breakfast (BF)</th>
                <th className="p-3.5 text-indigo-700 font-bold">Dinner (DIN)</th>
                <th className="p-3.5">Breaks</th>
                <th className="p-3.5 text-foreground font-bold">Total Covers</th>
                <th className="p-3.5">Package Codes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayedForecasts.map((row) => (
                <tr 
                  key={row.date} 
                  onClick={() => setSelectedDay(row)}
                  className={`cursor-pointer transition-all hover:bg-[#F2EBE4]/30 ${
                    selectedDay?.date === row.date ? 'bg-accent/5' : ''
                  }`}
                >
                  <td className="p-3.5 font-mono-custom font-bold text-foreground">{row.date}</td>
                  <td className="p-3.5 font-mono-custom text-muted-foreground">{row.dayOfWeek}</td>
                  <td className="p-3.5 font-mono-custom text-foreground">{row.roomsOccupied || '—'} Rms</td>
                  <td className="p-3.5 font-mono-custom font-bold text-accent">{row.totalBreakfast}</td>
                  <td className="p-3.5 font-mono-custom font-bold text-indigo-700">{row.totalDinner || 0}</td>
                  <td className="p-3.5 font-mono-custom text-muted-foreground">{row.totalBreaks || 0}</td>
                  <td className="p-3.5 font-mono-custom font-bold text-foreground text-sm">{row.totalCovers}</td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {Object.entries(row.packages || {}).map(([pkg, count]) => (
                        <span 
                          key={pkg} 
                          className="px-2 py-0.5 rounded-md text-[10px] font-mono-custom font-medium bg-[#F2EBE4]/60 border border-border text-muted-foreground"
                        >
                          <strong className="text-foreground">{pkg}:</strong> {count}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
