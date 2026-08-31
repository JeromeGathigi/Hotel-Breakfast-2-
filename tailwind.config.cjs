/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,html}'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1E3A8A',
        'on-primary': '#FFFFFF',
        secondary: '#3B82F6',
        accent: '#A16207',
        background: '#F8FAFC',
        foreground: '#1E40AF',
        card: '#FFFFFF',
        muted: '#E9EEF5',
        'muted-foreground': '#475569',
        border: '#BFDBFE',
        destructive: '#DC2626'
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px'
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0,0,0,0.05)',
        'md': '0 4px 6px rgba(0,0,0,0.1)',
        'lg': '0 10px 15px rgba(0,0,0,0.1)',
        'xl': '0 20px 25px rgba(0,0,0,0.15)'
      },
      fontFamily: {
        display: ['Playfair Display SC', 'serif'],
        body: ['Karla', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial']
      }
    }
  },
  plugins: []
};
