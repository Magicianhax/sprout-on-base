"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Coins, Rocket, ShieldCheck } from "lucide-react";
import { QuestionCard } from "@/components/onboarding/QuestionCard";
import { Button } from "@/components/ui/Button";
import { SproutLogo } from "@/components/ui/SproutLogo";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { usePreferences } from "@/lib/hooks/usePreferences";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { SUPPORTED_TOKENS } from "@/lib/constants";
import type { UserPreferences } from "@/lib/types";

const QUESTIONS = [
  {
    question: "How would you like your money to grow?",
    subtitle: "This helps us find the right opportunities for you",
    options: [
      { label: "Slow & steady", value: "low", description: "Lower returns, very stable" },
      { label: "A good balance", value: "medium", description: "Moderate returns, some variability" },
      { label: "I don't mind some bumps", value: "high", description: "Higher potential returns" },
    ],
  },
  {
    question: "Have you used apps like this before?",
    subtitle: "We'll adjust the experience to match",
    options: [
      { label: "First time", value: "beginner" },
      { label: "A little", value: "intermediate" },
      { label: "I'm a pro", value: "advanced" },
    ],
  },
];

const TOTAL_STEPS = 4; // welcome + 2 questions + token picker

export default function OnboardingPage() {
  // -1 = welcome, 0..N-1 = questions, N = token picker
  const [step, setStep] = useState<number>(-1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const router = useRouter();
  const { update } = usePreferences();

  function handleSelect(value: string) {
    const key = step === 0 ? "riskLevel" : "experienceLevel";
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setTimeout(() => setStep((s) => s + 1), 250);
  }

  function toggleToken(symbol: string) {
    setSelectedTokens((prev) =>
      prev.includes(symbol) ? prev.filter((t) => t !== symbol) : [...prev, symbol]
    );
  }

  function handleFinish() {
    if (selectedTokens.length === 0) return;
    const mode: UserPreferences["mode"] =
      answers.experienceLevel === "beginner" ? "lite" : "pro";
    update({
      mode,
      riskLevel: answers.riskLevel as UserPreferences["riskLevel"],
      experienceLevel: answers.experienceLevel as UserPreferences["experienceLevel"],
      preferredTokens: selectedTokens,
      onboardingComplete: true,
    });
    router.replace("/home");
  }

  const isWelcome = step === -1;
  const isTokenStep = step >= QUESTIONS.length;
  // Progress index (0..TOTAL_STEPS-1), clamped so welcome reads as step 0
  const progressIndex = Math.max(0, step + 1);

  return (
    <AuthGuard>
      <main className="min-h-dvh bg-sprout-gradient px-5 pt-16 pb-8 flex flex-col">
        <div className="flex justify-center gap-2 mb-10">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i <= progressIndex
                  ? "w-6 bg-sprout-green-primary"
                  : "w-2 bg-gray-200"
              }`}
            />
          ))}
        </div>

        {isWelcome ? (
          <div className="flex flex-col flex-1">
            <div className="flex flex-col items-center text-center">
              <SproutLogo
                size={96}
                decorative
                className="mb-6 shadow-subtle rounded-[22px]"
              />
              <h1 className="font-heading text-3xl font-800 text-sprout-green-dark">
                Welcome to Sprout
              </h1>
              <p className="font-body text-sprout-text-secondary mt-3 text-center text-base max-w-[320px] leading-relaxed">
                A savings app that happens to be DeFi. Earn on your crypto as
                easily as a savings account.
              </p>
            </div>

            <div className="mt-10 flex flex-col gap-3">
              <WelcomePoint
                icon={<Coins size={18} strokeWidth={2.5} />}
                title="Real yield"
                body="Your deposit earns on audited DeFi protocols like Morpho, Aave, and Euler."
              />
              <WelcomePoint
                icon={<ShieldCheck size={18} strokeWidth={2.5} />}
                title="Non-custodial"
                body="Only your wallet can move your funds. Sprout never takes custody."
              />
              <WelcomePoint
                icon={<Rocket size={18} strokeWidth={2.5} />}
                title="One tap to start"
                body="Pick a token, tap Earn. Withdraw anytime, no lockups."
              />
            </div>

            <div className="mt-auto pt-8">
              <Button
                className="w-full text-base"
                onClick={() => setStep(0)}
              >
                Get started
                <ArrowRight size={16} strokeWidth={2.5} className="ml-1 inline" />
              </Button>
              <p className="text-center text-[11px] text-sprout-text-muted mt-4">
                Takes less than 30 seconds
              </p>
            </div>
          </div>
        ) : !isTokenStep ? (
          <QuestionCard
            question={QUESTIONS[step].question}
            subtitle={QUESTIONS[step].subtitle}
            options={QUESTIONS[step].options}
            onSelect={handleSelect}
            selected={answers[step === 0 ? "riskLevel" : "experienceLevel"]}
          />
        ) : (
          <div className="flex flex-col flex-1">
            <div className="flex flex-col items-center">
              <h2 className="font-heading text-2xl font-700 text-sprout-text-primary text-center">
                What do you have to deposit?
              </h2>
              <p className="text-sm text-sprout-text-secondary mt-2 text-center">
                Pick one or more — you can always change later
              </p>
              <div className="grid grid-cols-3 gap-3 mt-8 w-full">
                {SUPPORTED_TOKENS.map((token) => (
                  <button
                    key={token.symbol}
                    onClick={() => toggleToken(token.symbol)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-card border-[1.5px] transition-all cursor-pointer
                      ${
                        selectedTokens.includes(token.symbol)
                          ? "border-sprout-green-primary bg-sprout-green-light"
                          : "border-sprout-border bg-sprout-card"
                      }`}
                  >
                    <TokenIcon type="token" identifier={token.symbol} size={36} />
                    <span className="text-sm font-semibold text-sprout-text-primary">
                      {token.symbol}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-auto pt-8 w-full">
              <Button
                onClick={handleFinish}
                disabled={selectedTokens.length === 0}
                className="w-full"
              >
                Let&apos;s go
              </Button>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}

function WelcomePoint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-sprout-card border border-sprout-border px-4 py-3 shadow-subtle">
      <div className="w-9 h-9 rounded-full bg-sprout-green-light flex items-center justify-center text-sprout-green-dark shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-sprout-text-primary">{title}</p>
        <p className="text-xs text-sprout-text-muted mt-0.5 leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  );
}
