// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AiPage from "./AiPage";
import { CURRENT_LOCATION_QUESTION } from "@/lib/aiEngine";

const { postChat } = vi.hoisted(() => ({ postChat: vi.fn() }));
vi.mock("@/lib/api/providers", () => ({
  getDataMode: () => "api",
  getDataProvider: () => ({ postChat }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  postChat.mockReset();
});

async function openLocationPrompt(allowRetry: boolean) {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: vi.fn<Geolocation["getCurrentPosition"]>()
        .mockImplementationOnce((_success, fail) => fail?.({ code: 1 } as GeolocationPositionError))
        .mockImplementationOnce((success, fail) => {
          if (allowRetry) success({ coords: { latitude: 36.77, longitude: 126.93 } } as GeolocationPosition);
          else fail?.({ code: 1 } as GeolocationPositionError);
        }),
    },
  });

  const { container } = render(
    h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(AiPage))),
  );
  const dialog = container.querySelector("dialog")!;
  // jsdom does not implement the native dialog methods.
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  await act(async () => {});
  return dialog;
}

describe("chat location permission", () => {
  it("requests location again and searches using the granted coordinates", async () => {
    postChat.mockResolvedValue({ message: "검색 결과", placeCandidates: [], matched: [], needsCheck: [], state: {} });
    const dialog = await openLocationPrompt(true);
    const question = await screen.findByRole("button", { name: CURRENT_LOCATION_QUESTION });
    fireEvent.click(question);
    expect(dialog.open).toBe(true);
    expect(postChat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "위치 권한 요청" }));
    await waitFor(() => expect(postChat).toHaveBeenCalledWith({ message: "", location: { lat: 36.77, lng: 126.93 } }));
    expect(dialog.open).toBe(false);
  });

  it("explains how to enable permission when the retry is denied", async () => {
    const dialog = await openLocationPrompt(false);
    const question = await screen.findByRole("button", { name: CURRENT_LOCATION_QUESTION });
    fireEvent.click(question);
    expect(dialog.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "위치 권한 요청" }));
    await screen.findByText(/위치 권한이 꺼져 있어요/);
    expect(postChat).not.toHaveBeenCalled();
  });
});
