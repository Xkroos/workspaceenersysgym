import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Interfaces Existentes ---

export interface Order {
  id: string;
  user_id: string;
  order_date: string;
  customer_name: string;
  product_description: string;
  purchase_price: number;
  sale_price: number;
  profit: number;
  status: 'pendiente' | 'pagado';
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  payment_date: string;
  reference_number: string;
  payment_image_url: string;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  note_text: string;
  created_at: string;
  updated_at: string;
}

// --- 🚀 NUEVA INTERFAZ PARA LA TABLA 'financial_transactions' ---

export interface FinancialTransaction {
  id: string;
  user_id: string;
  amount: number; // Monto de la transacción (inversión o retiro)
  description: string; // Breve descripción de la razón
  type: 'inversion' | 'retiro'; // Coincide con el ENUM 'transaction_type' en Supabase
  transaction_date: string;
  created_at: string; // Usualmente supabase agrega 'created_at' automáticamente
}

export interface InventoryItem {
  id: string;
  user_id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  unit_price: number; // Precio de Compra
  sale_price: number; // Precio de Venta (NUEVO)
  supplier: string | null;
  created_at: string;
}
