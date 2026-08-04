# End User License Agreement

**Product:** Atlyn Control Chart (Power BI custom visual)
**Publisher:** Atlyn
**Effective date:** 2026-08-04

This End User License Agreement ("Agreement") is a legal agreement between you
("You") and Atlyn ("Publisher") for the Atlyn Control Chart Power BI custom
visual, including its packaged code, assets, and accompanying documentation (the
"Software"). By installing, importing, or using the Software, You agree to be
bound by this Agreement. If You do not agree, do not install or use the
Software.

The Software is released under the MIT License. A copy of that license is
included in the repository as `LICENSE`, and its terms are incorporated into this
Agreement by reference. Where this Agreement and the MIT License differ, the MIT
License governs the copyright grant and the warranty and liability disclaimers.

## 1. License grant

Subject to Your compliance with this Agreement, the Publisher grants You a
worldwide, royalty-free, non-exclusive, perpetual license to use, copy, modify,
merge, publish, distribute, sublicense, and sell copies of the Software, on the
condition that the copyright notice and permission notice in `LICENSE` are
included in all copies or substantial portions of the Software.

The Microsoft AppSource listing for the Software is free of charge. Any
subscription You hold with Atlyn is a separate commercial agreement with the
Publisher and is not required to install or use the Software.

## 2. Ownership

The Software is licensed, not sold. Except for the rights expressly granted in
Section 1, the Publisher and its licensors retain all right, title, and interest
in and to the Software, including all intellectual property rights. The "Atlyn"
name and logo are the Publisher's marks and are not licensed for use as an
endorsement or as a product identifier for derivative works without prior written
permission.

## 3. Third-party components

The Software incorporates open-source components, including Microsoft's
`powerbi-visuals-api` package. Those components remain subject to their own
license terms, which apply in addition to this Agreement.

## 4. Data handling and privacy

The Software runs entirely inside the Power BI host sandbox. It declares no
privileges in its `capabilities.json`, makes no network calls, loads no external
resources, and transmits no data to the Publisher or to any third party. All
data the Software processes stays within Your Power BI tenant and is provided to
the Software solely by the Power BI host.

The Publisher's privacy policy is available at
<https://atlyn.io/legal/privacy>.

## 5. Statistical scope and no fitness claim

The Software computes statistical process control limits, sigma bands, and rule
violations from the subgroup window supplied by the Power BI host, which is
bounded at 30,000 rows. It reports the received, rendered, invalid, and dropped
row counts and explicitly labels a truncated or still-loading window as partial.

A control limit is a description of process variation, not a specification, a
target, or a compliance threshold. A rule violation is a signal to investigate,
not proof of a root cause. The Software does not assert that the configured
chart mode, sigma multiplier, subgroup definition, or baseline grouping is
statistically appropriate for Your data. You are responsible for confirming that
the chart type and its parameters suit Your analytical, clinical, engineering, or
regulatory purpose, and for any decision taken on the basis of its output.

## 6. Support

Support is provided on a commercially reasonable, best-effort basis through
<https://atlyn.io/contact>. Nothing in this Agreement obligates the Publisher to
provide updates, upgrades, or a defined response time.

## 7. Disclaimer of warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.

## 8. Limitation of liability

IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR
OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

## 9. Termination

This Agreement terminates automatically if You materially breach it. Upon
termination You must stop using the Software, although any copies You have
already distributed in compliance with the MIT License remain licensed to their
recipients.

## 10. General

This Agreement is the entire agreement between You and the Publisher regarding
the Software and supersedes any prior understanding on the same subject. If any
provision is held unenforceable, the remaining provisions stay in effect. The
Publisher's general terms of service are available at
<https://atlyn.io/legal/terms>.

## Contact

Atlyn - <atlyn.help@gmail.com> - <https://atlyn.io/contact>
