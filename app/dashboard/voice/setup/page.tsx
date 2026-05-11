"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Mic, Save } from "lucide-react";

export default function VoiceSetupPage() {
    return (
        <div className="space-y-8 max-w-[800px] mx-auto pb-10">
            <div>
                <h1 className="text-2xl font-bold">Agent Configuration</h1>
                <p className="text-slate-500">Configure your AI voice assistant's personality and tools</p>
            </div>

            <Tabs defaultValue="personality" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="personality">Personality</TabsTrigger>
                    <TabsTrigger value="voice">Voice & Audio</TabsTrigger>
                    <TabsTrigger value="tools">Integration Tools</TabsTrigger>
                </TabsList>

                <TabsContent value="personality" className="space-y-4 mt-6">
                    <Card className="border-slate-200">
                        <CardHeader>
                            <CardTitle>Agent Persona</CardTitle>
                            <CardDescription>Define how your agent introduces itself</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Agent Name</Label>
                                <Input defaultValue="Fatima" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Role Description</Label>
                                <Input defaultValue="Senior Real Estate Consultant at Asquared" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Opening Greeting</Label>
                                <Input defaultValue="Hello, this is Fatima from Asquared. I noticed you were interested in our beachfront properties." />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="voice" className="space-y-4 mt-6">
                    <Card className="border-slate-200">
                        <CardHeader>
                            <CardTitle>Voice Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Voice Model</Label>
                                <Select defaultValue="sara">
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a voice" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sara">Sara (Professional, Female)</SelectItem>
                                        <SelectItem value="james">James (Deep, Male)</SelectItem>
                                        <SelectItem value="noor">Noor (Arabic Accent, Female)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Speed</Label>
                                <div className="h-10 border border-slate-200 rounded-md flex items-center px-4 bg-slate-50 text-slate-500">
                                    1.0x (Natural)
                                </div>
                            </div>
                            <Button variant="outline" className="w-full gap-2">
                                <Mic className="h-4 w-4" /> Test Voice Sample
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="tools" className="mt-6">
                    <Card className="border-slate-200">
                        <CardContent className="p-6 text-center text-slate-500">
                            Configure Calendar and CRM integrations here.
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-4">
                <Button variant="outline">Cancel</Button>
                <Button className="bg-purple-600 hover:bg-purple-700 gap-2">
                    <Save className="h-4 w-4" /> Save Changes
                </Button>
            </div>
        </div>
    );
}

