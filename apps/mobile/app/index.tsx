import { Redirect } from "expo-router";
import { useAuth } from "../src/auth";
import { Loading } from "../src/ui";
export default function Index() { const { ready, token, onboardingRequired } = useAuth(); if (!ready) return <Loading/>; if (!token) return <Redirect href="/login"/>; if (onboardingRequired) return <Redirect href="/onboarding"/>; return <Redirect href="/home"/>; }
