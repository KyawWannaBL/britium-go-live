import { loadOperationalQueue } from "@/lib/britiumOperationalApi";

const [rows, setRows] = useState<any[]>([]);
const [loading, setLoading] = useState(false);

async function loadData() {
  setLoading(true);
  try {
    setRows(await loadOperationalQueue("cs"));
  } finally {
    setLoading(false);
  }
}

useEffect(() => { loadData(); }, []);
