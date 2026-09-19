import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/" />
      </div>
    </main>
  );
}