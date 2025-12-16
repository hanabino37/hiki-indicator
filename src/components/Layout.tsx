import React from "react";
import "../styles/layout.css";

interface LayoutProps {
    children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    return (
        <div className="app-shell">
            <header className="app-header">
                <h1>Hiki Indicator</h1>
            </header>

            <main className="app-main">
                {children}
            </main>

            <footer className="app-footer">
                <p>&copy; 2025 Hiki Indicator</p>
            </footer>
        </div>
    );
}
