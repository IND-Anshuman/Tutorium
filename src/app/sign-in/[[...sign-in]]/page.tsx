import { SignIn, SignUp } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/" />
      </div>
    </main>
  );
}