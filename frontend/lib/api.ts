import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
})

export default api

export const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID || 'af115682-0af2-477e-a5ad-f73ff5844f1e'
