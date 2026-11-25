import type { Metadata } from 'next';
import { AuthFrame } from '@/components/AuthFrame';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <AuthFrame><LoginForm /></AuthFrame>;
}
