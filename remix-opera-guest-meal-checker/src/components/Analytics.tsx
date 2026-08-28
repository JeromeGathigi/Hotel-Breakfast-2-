import React, { useState, useEffect } from 'react';
import { db, toJsDate } from '../firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { CheckIn, Guest } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Calendar, Users, TrendingUp, Clock, ChevronLeft, ChevronRight, Download, UserCheck, AlertCircle, List, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { bangkokHour, businessDate, businessMonth } from '../lib/businessDate';
import { entitledPax, hasMealEntitlement } from '../lib/meals';

interface AnalyticsProps {
  hotelId: string;
}

interface DailyStats {
  date: string;
  bookedAdults: number;
  bookedChildren: number;
  bookedRooms: number;
  actualAdults: number;
  actualChildren: number;
  actualInfants: number;
  attendedRooms: number;
  noShows: number;
  noShowRooms: number;
}

export const Analytics: React.FC<AnalyticsProps> = ({ hotelId }) => {
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => businessMonth());
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [hourlyTraffic, setHourlyTraffic] = useState<{ hour: string; count: number }[]>([]);

  useEffect(() => {
    fetchData();
  }, [hotelId, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const stats: DailyStats[] = [];
      const trafficMap: Record<string, number> = {};
      
      for (let hour = 6; hour <= 10; hour++) {
        trafficMap[`${hour.toString().padStart(2, '0')}:00`] = 0;
      }
      trafficMap['10:30'] = 0;

      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();

      const today = businessDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
        if (dateStr > today) continue;

        let bookedA = 0, bookedC = 0, bookedRooms = 0;
        let actualA = 0, actualC = 0, actualI = 0;
        let attendedRooms = 0;

        const eligibleRooms = new Set<string>();

        const checkinsRef = collection(db, 'hotels', hotelId, 'checkins', dateStr, 'rooms');
        const checkinsSnap = await getDocs(checkinsRef);
        
        checkinsSnap.docs.forEach(doc => {
          const data = doc.data() as CheckIn;
          actualA += data.adultsAte || 0;
          actualC += data.childrenAte || 0;
          actualI += data.infantsAte || 0;

          if (eligibleRooms.has(doc.id)) {
            attendedRooms += 1;
          }

          if (data.timestamp) {
            const jsDate = toJsDate(data.timestamp);
            if (jsDate) {
              const bangkok = bangkokHour(jsDate);
              const minute = jsDate.getMinutes();
              if (bangkok < 6 || bangkok > 10) return;
              let hourStr = `${bangkok.toString().padStart(2, '0')}:00`;
              if (bangkok === 10 && minute >= 30) hourStr = '10:30';
              trafficMap[hourStr] = (trafficMap[hourStr] || 0) + (data.adultsAte + data.childrenAte + data.infantsAte);
            }
          }
        });

        if (dateStr === today) {
          const guestsRef = collection(db, 'hotels', hotelId, 'guests');
          const guestsSnap = await getDocs(guestsRef);
          guestsSnap.docs.forEach(doc => {
            const data = doc.data() as Guest;
            if (!hasMealEntitlement(data.mealPlan)) return;
            bookedA += Number(data.adults || 0);
            bookedC += Number(data.children || 0);
            bookedRooms += 1;
            eligibleRooms.add(data.roomNumber);
          });
        } else {
          const historyRef = collection(db, 'hotels', hotelId, 'history', dateStr, 'guests');
          const historySnap = await getDocs(historyRef);
          historySnap.docs.forEach(doc => {
            const data = doc.data() as Guest;
            if (!hasMealEntitlement(data.mealPlan)) return;
            bookedA += Number(data.adults || 0);
            bookedC += Number(data.children || 0);
            bookedRooms += 1;
            eligibleRooms.add(data.roomNumber);
          });
        }

        attendedRooms = Array.from(eligibleRooms).filter((room) => checkinsSnap.docs.some((doc) => doc.id === room)).length;

        if (bookedA > 0 || actualA > 0) {
          const noShows = Math.max(0, (bookedA + bookedC) - (actualA + actualC));
          const noShowRooms = Math.max(0, bookedRooms - attendedRooms);
          stats.push({
            date: dateStr,
            bookedAdults: bookedA,
            bookedChildren: bookedC,
            bookedRooms,
            actualAdults: actualA,
            actualChildren: actualC,
            actualInfants: actualI,
            attendedRooms,
            noShows,
            noShowRooms,
          });
        }
      }

      setDailyStats(stats);
      setHourlyTraffic(Object.entries(trafficMap).map(([hour, count]) => ({ hour, count })));
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalBooked = dailyStats.reduce((acc, curr) => acc + curr.bookedAdults + curr.bookedChildren, 0);
  const totalActual = dailyStats.reduce((acc, curr) => acc + curr.actualAdults + curr.actualChildren + curr.actualInfants, 0);
  const totalNoShows = dailyStats.reduce((acc, curr) => acc + curr.noShows, 0);

  const lastSevenDays = [...dailyStats].slice(-7);
  const weekBooked = lastSevenDays.reduce((acc, curr) => acc + curr.bookedAdults + curr.bookedChildren, 0);
  const weekActual = lastSevenDays.reduce((acc, curr) => acc + curr.actualAdults + curr.actualChildren + curr.actualInfants, 0);
  const weekNoShows = lastSevenDays.reduce((acc, curr) => acc + curr.noShows, 0);

  return (
    <div className="space-y-8 pb-20">
      {/* Historical Data Info Banner */}
      <div className="p-4 bg-accent/5 border-accent/20 flex items-start gap-4 rounded-lg">
        <div className="p-2 bg-accent/10 rounded-xl text-accent shrink-0">
          <Info size={20} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-black text-accent uppercase tracking-widest">Historical Data Note</p>
          <p className="text-xs text-muted-foreground leading-relaxed font-medium">
            Daily reports are automatically archived at midnight each day. However, historical performance data only becomes available starting from the first day this system was activated. To maintain accuracy, please ensure daily guest reports are uploaded promptly each morning.
          </p>
        </div>
      </div>

      {/* Header & Month Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">Performance Analytics</h2>
          <p className="text-accent font-bold uppercase tracking-[0.2em] text-xs mt-1">Monthly Insights & Trends</p>
        </div>
        
        <div className="flex items-center gap-4 bg-card p-2 rounded-xl border border-border shadow-md">
          <button 
            onClick={() => {
              const d = new Date(`${selectedMonth}-01T00:00:00Z`);
              d.setUTCMonth(d.getUTCMonth() - 1);
              setSelectedMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-2 hover:bg-accent/10 rounded-xl text-accent transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2 px-4">
            <Calendar size={18} className="text-accent" />
            <span className="font-black text-foreground uppercase tracking-widest text-sm">
              {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <button 
            onClick={() => {
              const d = new Date(`${selectedMonth}-01T00:00:00Z`);
              d.setUTCMonth(d.getUTCMonth() + 1);
              setSelectedMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-2 hover:bg-accent/10 rounded-xl text-accent transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card p-8 border-l-4 border-accent rounded-lg"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-accent/10 rounded-2xl text-accent">
              <Users size={24} />
            </div>
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">This month</span>
          </div>
          <p className="text-4xl font-black text-foreground">{totalBooked.toLocaleString()}</p>
          <p className="text-xs font-bold text-muted-foreground uppercase mt-2">Expected Guests</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card p-8 border-l-4 border-green-500 rounded-xl"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-green-500/10 rounded-2xl text-green-500">
              <UserCheck size={24} />
            </div>
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">This month</span>
          </div>
          <p className="text-4xl font-black text-foreground">{totalActual.toLocaleString()}</p>
          <p className="text-xs font-bold text-muted-foreground uppercase mt-2">Checked-in Guests</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card p-8 border-l-4 border-red-500 rounded-xl"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-red-500/10 rounded-2xl text-red-500">
              <AlertCircle size={24} />
            </div>
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Last 7 days</span>
          </div>
          <p className="text-4xl font-black text-foreground">{weekNoShows.toLocaleString()}</p>
          <p className="text-xs font-bold text-muted-foreground uppercase mt-2">Missed Breakfasts</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card p-8 border-l-4 border-blue-500 rounded-xl"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
              <TrendingUp size={24} />
            </div>
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Last 7 days</span>
          </div>
          <p className="text-4xl font-black text-foreground">
            {weekBooked > 0 ? Math.round((weekActual / weekBooked) * 100) : 0}%
          </p>
          <p className="text-xs font-bold text-muted-foreground uppercase mt-2">Attendance Rate</p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card p-6 rounded-xl border border-border">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Week to date</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-black text-foreground">{weekBooked.toLocaleString()}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mt-1">Booked pax</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-accent">{weekActual.toLocaleString()}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mt-1">Actual pax</p>
            </div>
          </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Selected month</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-black text-foreground">{totalBooked.toLocaleString()}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mt-1">Booked pax</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-accent">{totalActual.toLocaleString()}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mt-1">Actual pax</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hourly Traffic Chart */}
        <div className="bg-card p-8 rounded-xl border border-border">
          <div className="flex items-center gap-3 mb-8">
            <Clock className="text-accent" size={20} />
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest">Peak Arrival Times</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyTraffic}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis 
                  dataKey="hour" 
                  stroke="#666" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#666" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #D4AF37', borderRadius: '12px' }}
                  itemStyle={{ color: '#D4AF37', fontWeight: 'bold' }}
                />
                <Bar dataKey="count" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Trend Chart */}
        <div className="bg-card p-8 rounded-xl border border-border">
          <div className="flex items-center gap-3 mb-8">
            <TrendingUp className="text-accent" size={20} />
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest">Daily Attendance Trend</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#666" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => val.split('-')[2]}
                />
                <YAxis 
                  stroke="#666" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #D4AF37', borderRadius: '12px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }} />
                <Line type="monotone" dataKey="bookedAdults" name="Booked" stroke="#666" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="actualAdults" name="Actual" stroke="#D4AF37" strokeWidth={3} dot={{ r: 4, fill: '#D4AF37' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Summary Table */}
      <div className="bg-card overflow-hidden rounded-xl border border-border">
        <div className="p-8 border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-3">
            <List className="text-accent" size={20} />
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest">Daily Breakdown</h3>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-xl font-bold text-xs hover:bg-accent/20 transition-all">
            <Download size={14} />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-accent/5">
                <th className="px-8 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Date</th>
                <th className="px-8 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Booked (A/C)</th>
                <th className="px-8 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Actual (A/C/I)</th>
                <th className="px-8 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">No Shows</th>
                <th className="px-8 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dailyStats.map((stat) => (
                <tr key={stat.date} className="hover:bg-accent/5 transition-colors">
                  <td className="px-8 py-4 font-bold text-foreground">{stat.date}</td>
                  <td className="px-8 py-4 font-medium text-muted-foreground">
                    {stat.bookedAdults} / {stat.bookedChildren}
                  </td>
                  <td className="px-8 py-4 font-black text-accent">
                    {stat.actualAdults} / {stat.actualChildren} / {stat.actualInfants}
                  </td>
                  <td className="px-8 py-4 font-bold text-red-500">{stat.noShows}</td>
                  <td className="px-8 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                      ((stat.actualAdults + stat.actualChildren) / (stat.bookedAdults + stat.bookedChildren || 1)) > 0.8 ? 'bg-green-500/10 text-green-500' : 'bg-accent/10 text-accent'
                    }`}>
                      {stat.bookedAdults + stat.bookedChildren > 0 ? Math.round(((stat.actualAdults + stat.actualChildren) / (stat.bookedAdults + stat.bookedChildren)) * 100) : 0}%
                    </span>
                  </td>
                </tr>
              ))}
              {dailyStats.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-muted-foreground italic font-medium">
                    No data available for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
