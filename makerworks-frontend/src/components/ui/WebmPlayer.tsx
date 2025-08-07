const WebmPlayer: React.FC<{ fileUrl: string }> = ({ fileUrl }) => (
  <video
    src={fileUrl}
    autoPlay
    loop
    muted
    controls
    className="rounded-md shadow w-full"
  />
);

export default WebmPlayer;
