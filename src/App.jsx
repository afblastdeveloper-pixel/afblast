import { AuthProvider } from './context/AuthContext'
import { ConfigProvider } from './context/ConfigContext'
import { ThemeProvider } from './context/ThemeContext'
import CombinedRouter from './routes/CombinedRouter'

/**
 * Root Component AF Blast
 * Menjalankan Member Portal dan Staff Portal (di bawah STAFF_BASE /staff) dalam satu domain tunggal.
 * Sesi member dan sesi staf terpisah dan independen.
 */
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ConfigProvider>
          <CombinedRouter />
        </ConfigProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}