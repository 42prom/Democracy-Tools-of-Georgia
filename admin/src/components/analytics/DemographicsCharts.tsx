
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import Card from '../ui/Card';
import type { PollResults } from '../../types';

interface DemographicsChartsProps {
  results: PollResults;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function DemographicsCharts({ results }: DemographicsChartsProps) {
  if (!results.breakdowns) {
    return null;
  }

  const { age, gender, region } = results.breakdowns;

  // Transform breakdown data for charts
  const ageData = age?.cohorts.map((c) => ({
    name: c.value,
    count: typeof c.count === 'number' ? c.count : 0,
    percentage: c.percentage,
  })) || [];

  const genderData = gender?.cohorts.map((c) => ({
    name: c.value.charAt(0).toUpperCase() + c.value.slice(1),
    count: typeof c.count === 'number' ? c.count : 0,
    percentage: c.percentage,
  })) || [];

  const regionData = region?.cohorts.map((c) => ({
    name: c.value,
    count: typeof c.count === 'number' ? c.count : 0,
    percentage: c.percentage,
  }))
  .sort((a, b) => b.count - a.count) // Sort regions by count descending
  .slice(0, 10); // Top 10 regions

  // Custom Toolkit for Pie Chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-2 border border-gray-200 shadow-sm rounded text-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-gray-600">
            {data.count} votes ({data.percentage.toFixed(1)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Demographics</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Age Distribution */}
        <Card>
          <h4 className="text-sm font-medium text-gray-700 mb-4">Age Distribution</h4>
          <div className="h-64">
            {ageData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: '#f3f4f6' }}
                    content={({ active, payload, label }) => {
                       if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border border-gray-200 shadow-sm rounded text-sm">
                            <p className="font-medium">{label}</p>
                            <p className="text-gray-600">
                              {data.count} votes ({data.percentage?.toFixed(1)}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No age data available
              </div>
            )}
          </div>
        </Card>

        {/* Gender Distribution */}
        <Card>
          <h4 className="text-sm font-medium text-gray-700 mb-4">Gender Distribution</h4>
          <div className="h-64">
            {genderData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                  >
                    {genderData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No gender data available
              </div>
            )}
          </div>
        </Card>

        {/* Region Distribution - Full Width */}
        <Card className="md:col-span-2">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Top Regions</h4>
          <div className="h-64">
            {regionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={regionData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    cursor={{ fill: '#f3f4f6' }}
                    content={({ active, payload, label }) => {
                       if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border border-gray-200 shadow-sm rounded text-sm">
                            <p className="font-medium">{label}</p>
                            <p className="text-gray-600">
                              {data.count} votes ({data.percentage?.toFixed(1)}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No region data available
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
