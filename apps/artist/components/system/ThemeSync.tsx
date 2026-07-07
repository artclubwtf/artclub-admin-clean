"use client";
import {useEffect} from "react";
export function ThemeSync(){useEffect(()=>{const media=matchMedia("(prefers-color-scheme: dark)");const apply=()=>{const preference=localStorage.getItem("artclub-theme")||"system";document.documentElement.dataset.theme=preference==="dark"||(preference==="system"&&media.matches)?"dark":"light"};apply();media.addEventListener("change",apply);window.addEventListener("storage",apply);return()=>{media.removeEventListener("change",apply);window.removeEventListener("storage",apply)}},[]);return null}
