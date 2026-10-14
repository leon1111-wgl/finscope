import numpy as np
import pandas as pd
import pytest

from finscope.metrics import drift_psi, forecast_metrics, strategy_metrics, strategy_series


def test_signal_has_two_close_lag_and_pays_initial_entry_cost():
    frame = pd.DataFrame({"date": pd.bdate_range("2022-01-03", periods=5), "ticker": ["AAA"] * 5, "close": [100, 110, 121, 133.1, 146.41], "prediction": [0.1] * 5})
    result = strategy_series(frame, cost_bps=100, target_vol=0.2)
    np.testing.assert_allclose(result.position.to_numpy(), [0, 0, 1, 1, 1])
    np.testing.assert_allclose(result.net_return.to_numpy(), [0, 0, 0.09, 0.1, 0.1], atol=1e-10)


def test_psi_uses_train_fitted_bins_and_is_finite_for_constant_inputs():
    train = np.array([1.] * 100)
    test = np.array([1.] * 30)
    assert drift_psi(train, test) == 0.0
    assert drift_psi(np.arange(100.), np.arange(100.) + 200) > 0.25


def test_strategy_rejects_incomplete_multi_ticker_panel_instead_of_reweighting():
    frame = pd.DataFrame({
        "date": ["2022-01-03", "2022-01-03", "2022-01-04"],
        "ticker": ["AAA", "BBB", "AAA"],
        "close": [100., 100., 110.], "prediction": [0.1, 0.1, 0.1],
    })
    with pytest.raises(ValueError, match="complete common-date panel"):
        strategy_series(frame, cost_bps=0)
    frame["net_return"] = [0., 0., 0.1]
    frame["turnover"] = [0., 0., 1.]
    with pytest.raises(ValueError, match="complete common-date panel"):
        strategy_metrics(frame)


def test_complete_multi_ticker_panel_uses_stable_equal_weights():
    days = pd.bdate_range("2022-01-03", periods=3)
    frame = pd.DataFrame([
        {"date": day, "ticker": ticker, "close": close, "prediction": 0.1}
        for day, a, b in zip(days, [100., 100., 110.], [100., 100., 100.])
        for ticker, close in (("AAA", a), ("BBB", b))
    ])
    result = strategy_series(frame, cost_bps=0)
    assert strategy_metrics(result)["total_return"] == pytest.approx(0.05)


def test_strategy_direct_input_rejects_unrepresentable_close_ratio():
    frame = pd.DataFrame({"date": pd.bdate_range("2022-01-03", periods=3), "ticker": ["AAA"] * 3, "close": [1., 1e-300, 1e300], "prediction": [0.1] * 3})
    with pytest.raises(ValueError, match="close-to-close ratio"):
        strategy_series(frame)


def test_forecast_squared_loss_overflow_has_clear_error_not_runtime_warning():
    rows = pd.DataFrame({"actual": [1e200], "prediction": [0.], "lower": [0.], "upper": [1e200]})
    with np.errstate(over="raise", invalid="raise"):
        with pytest.raises(ValueError, match="forecast metrics"):
            forecast_metrics(rows)


def test_strategy_compounding_overflow_has_clear_error_not_runtime_warning():
    rows = pd.DataFrame({"date": pd.bdate_range("2022-01-03", periods=2), "ticker": ["AAA"] * 2, "net_return": [1e200, 1e200], "turnover": [0., 0.]})
    with np.errstate(over="raise", invalid="raise"):
        with pytest.raises(ValueError, match="strategy cumulative return"):
            strategy_metrics(rows)
