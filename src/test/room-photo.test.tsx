import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomPhoto } from "@/components/site/RoomPhoto";
import { getRoomPhotoUrl } from "@/lib/firebase-data";

vi.mock("@/lib/firebase-data", () => ({
  getRoomPhotoUrl: vi.fn(),
}));

describe("RoomPhoto", () => {
  beforeEach(() => {
    vi.mocked(getRoomPhotoUrl).mockReset();
  });

  it("resolves Firestore room-photo references without changing the reference", async () => {
    const photoReference = "firestore-room-photo:photo-123";
    vi.mocked(getRoomPhotoUrl).mockResolvedValue("data:image/jpeg;base64,photo");

    render(<RoomPhoto src={photoReference} alt="Uploaded room" />);

    await waitFor(() => {
      expect(getRoomPhotoUrl).toHaveBeenCalledWith(photoReference);
    });
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Uploaded room" })).toHaveAttribute(
        "src",
        "data:image/jpeg;base64,photo",
      );
    });
  });
});
