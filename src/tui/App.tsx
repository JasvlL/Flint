import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useFleet } from "./useFleet.js";
import { generatePlanFromGoal } from "../plan/metaPlanner.js";

export default function App() {
  const { tasks, isRunning, totalCostUsd, startRun } = useFleet();
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = async (text: string) => {
    if (isRunning) return;
    setInputValue("");
    try {
      const plan = await generatePlanFromGoal(text);
      startRun(plan);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <Box flexDirection="column">
      <Text>
        FLINT <Text color="green">${totalCostUsd.toFixed(4)}</Text>
      </Text>
      <Box flexDirection="column">
        {tasks.map((task) => {
          const statusColor =
            task.status === "running"
              ? "yellow"
              : task.status === "pass"
              ? "green"
              : task.status === "failed"
              ? "red"
              : "white";

          const workerInfo = task.worker ? ` ${task.worker}${task.model ? `/${task.model}` : ""}` : "";
          const attemptInfo =
            task.status === "running" && task.attempt && task.totalCandidates
              ? ` attempt ${task.attempt}/${task.totalCandidates}`
              : "";

          return (
            <Text key={task.id} color={statusColor}>
              {task.id}{workerInfo}{attemptInfo} {task.status}
            </Text>
          );
        })}
      </Box>
      <TextInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        placeholder={isRunning ? "Running..." : "Enter goal..."}
      />
    </Box>
  );
}